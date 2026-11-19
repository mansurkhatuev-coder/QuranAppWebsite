-- Debt forgiveness is not a payment. Preserve original principal and actual receipts.
begin;
alter table public.loans
 add column if not exists debt_written_off numeric(12,2) not null default 0 check (debt_written_off >= 0),
 add column if not exists writeoff_owner_profit numeric(12,2) not null default 0 check (writeoff_owner_profit >= 0),
 add column if not exists writeoff_investor_profit numeric(12,2) not null default 0 check (writeoff_investor_profit >= 0),
 add column if not exists writeoff_investor_capital numeric(12,2) not null default 0 check (writeoff_investor_capital >= 0),
 add column if not exists writeoff_history jsonb not null default '[]'::jsonb check (jsonb_typeof(writeoff_history) = 'array');
alter table public.payment_schedules
 add column if not exists written_off_amount numeric(12,2) not null default 0 check (written_off_amount >= 0);

-- Protect write-off totals from ordinary Data API writes and freeze deal terms after a waiver.
create or replace function public.guard_loan_writeoff_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if tg_op = 'INSERT' then
   if new.debt_written_off <> 0 or new.writeoff_history <> '[]'::jsonb or
      new.writeoff_owner_profit <> 0 or new.writeoff_investor_profit <> 0 or new.writeoff_investor_capital <> 0 then
     raise exception 'Write-off must be posted by the write-off RPC';
   end if;
   return new;
 end if;
 if current_user in ('authenticated','anon') and
    (new.debt_written_off,new.writeoff_owner_profit,new.writeoff_investor_profit,new.writeoff_investor_capital,new.writeoff_history)
    is distinct from
    (old.debt_written_off,old.writeoff_owner_profit,old.writeoff_investor_profit,old.writeoff_investor_capital,old.writeoff_history) then
   raise exception 'Write-off history is read-only' using errcode = '42501';
 end if;
 if old.debt_written_off > 0 and
    (new.principal,new.cost_amount,new.markup_percent,new.down_payment,new.term_months,new.start_date,
     new.monthly_payment,new.investor_id,new.investor_amount,new.income_share_manager,new.income_share_investor,
     new.schedule_on_full_amount,new.client_id,new.organization_id)
    is distinct from
    (old.principal,old.cost_amount,old.markup_percent,old.down_payment,old.term_months,old.start_date,
     old.monthly_payment,old.investor_id,old.investor_amount,old.income_share_manager,old.income_share_investor,
     old.schedule_on_full_amount,old.client_id,old.organization_id) then
   raise exception 'Условия рассрочки со списаниями нельзя изменять';
 end if;
 return new;
end;
$$;
drop trigger if exists guard_loan_writeoff_history on public.loans;
create trigger guard_loan_writeoff_history before insert or update on public.loans
for each row execute function public.guard_loan_writeoff_history();

create or replace function public.guard_schedule_writeoff_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if tg_op = 'INSERT' then
   if new.written_off_amount <> 0 then raise exception 'Write-off must be posted by the write-off RPC'; end if;
   if exists (select 1 from public.loans where id = new.loan_id and debt_written_off > 0) then
     raise exception 'Нельзя пересоздать график рассрочки со списанием';
   end if;
   return new;
 end if;
 if tg_op = 'DELETE' then
   -- A full loan deletion cascades after the parent row is gone.
   if exists (select 1 from public.loans where id = old.loan_id and debt_written_off > 0) then
     raise exception 'Нельзя удалять график рассрочки со списанием';
   end if;
   return old;
 end if;
 if current_user in ('authenticated','anon') and
    (new.written_off_amount is distinct from old.written_off_amount or
     ((new.amount,new.loan_id,new.organization_id,new.sequence_number,new.due_date)
        is distinct from (old.amount,old.loan_id,old.organization_id,old.sequence_number,old.due_date)
      and exists (select 1 from public.loans where id = old.loan_id and debt_written_off > 0))) then
   raise exception 'Write-off schedule history is read-only' using errcode = '42501';
 end if;
 return new;
end;
$$;
drop trigger if exists guard_schedule_writeoff_history on public.payment_schedules;
create trigger guard_schedule_writeoff_history before insert or update or delete on public.payment_schedules
for each row execute function public.guard_schedule_writeoff_history();

create or replace function public.write_off_loan_debt(
 p_loan_id uuid, p_amount numeric, p_expected_remaining numeric, p_expected_version bigint,
 p_mode text, p_reason text, p_accept_capital_loss boolean, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_uid uuid := auth.uid();
 v_org uuid := public.user_organization_id();
 v_loan public.loans%rowtype;
 v_schedule public.payment_schedules%rowtype;
 v_remaining numeric;
 v_left numeric;
 v_take numeric;
 v_paid numeric;
 v_profit numeric;
 v_owner numeric;
 v_investor numeric;
 v_profit_loss numeric;
 v_owner_loss numeric;
 v_investor_loss numeric;
 v_capital_loss numeric;
 v_prior_capital_loss numeric;
 v_investor_capital numeric;
 v_capital_base numeric;
 v_investor_capital_loss numeric;
 v_entry jsonb;
begin
 if v_uid is null or v_org is null or not public.organization_has_access(v_org)
   or not exists (select 1 from public.profiles where id=v_uid and organization_id=v_org and role='admin') then
   raise exception 'Organization access denied' using errcode='42501';
 end if;
 if p_request_id is null or p_mode is null or p_mode not in ('owner','proportional')
   or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
   or p_amount <= 0 or p_amount <> round(p_amount,2)
   or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then
   raise exception 'Invalid write-off parameters';
 end if;
 -- Same start-row -> loan -> remaining rows lock order as record_payment.
 perform id from public.payment_schedules where loan_id=p_loan_id and organization_id=v_org
   and status<>'paid' and amount-coalesce(paid_amount,0)>0
   order by sequence_number limit 1 for update;
 select * into v_loan from public.loans where id=p_loan_id and organization_id=v_org for update;
 if not found then raise exception 'Loan not found'; end if;
 select e.value into v_entry from jsonb_array_elements(v_loan.writeoff_history) as e(value)
   where e.value->>'id'=p_request_id::text limit 1;
 if found then return v_entry; end if;
 if v_loan.status<>'active' or p_expected_version is distinct from v_loan.offline_version then
   raise exception 'Рассрочка изменилась. Обновите данные и повторите списание';
 end if;
 perform id from public.payment_schedules where loan_id=p_loan_id and organization_id=v_org
   order by sequence_number for update;
 select coalesce(sum(greatest(0,amount-coalesce(paid_amount,0))),0) into v_remaining
   from public.payment_schedules where loan_id=p_loan_id and organization_id=v_org and status<>'paid';
 if p_expected_remaining is distinct from v_remaining or p_amount>v_remaining then
   raise exception 'Остаток изменился. Обновите данные и повторите списание';
 end if;
 if v_loan.cost_amount is null or v_loan.cost_amount<=0 or v_loan.principal<v_loan.cost_amount
    or v_loan.income_share_manager<0 or v_loan.income_share_investor<0 then
   raise exception 'Проверьте первоначальную цену и доли прибыли';
 end if;
 if abs((select coalesce(sum(amount),0) from public.payment_schedules where loan_id=p_loan_id and organization_id=v_org)
     - (v_loan.principal-coalesce(v_loan.down_payment,0)-v_loan.debt_written_off))>0.009 then
   raise exception 'График не соответствует сумме договора. Требуется проверка';
 end if;
 if (select coalesce(sum(written_off_amount),0) from public.payment_schedules where loan_id=p_loan_id and organization_id=v_org)
     <> v_loan.debt_written_off then raise exception 'История списаний не соответствует графику'; end if;
 v_profit:=greatest(0,v_loan.principal-v_loan.cost_amount);
 if v_loan.income_share_manager+v_loan.income_share_investor>0 then
   v_owner:=round(v_profit*v_loan.income_share_manager/(v_loan.income_share_manager+v_loan.income_share_investor),2);
 else v_owner:=v_profit; end if;
 v_investor:=greatest(0,v_profit-v_owner-v_loan.writeoff_investor_profit);
 v_owner:=greatest(0,v_owner-v_loan.writeoff_owner_profit);
 if p_mode='owner' and p_amount>v_owner then raise exception 'Прибыли владельца недостаточно'; end if;
 v_profit_loss:=least(p_amount,v_owner+v_investor);
 if p_mode='owner' then v_owner_loss:=v_profit_loss;
 elsif v_owner+v_investor>0 then
   v_owner_loss:=least(v_owner,greatest(v_profit_loss-v_investor,round(v_profit_loss*v_owner/(v_owner+v_investor),2)));
 else v_owner_loss:=0; end if;
 v_investor_loss:=v_profit_loss-v_owner_loss;
 v_capital_loss:=p_amount-v_profit_loss;
 v_prior_capital_loss:=greatest(0,v_loan.debt_written_off-v_loan.writeoff_owner_profit-v_loan.writeoff_investor_profit);
 v_investor_capital:=greatest(0,coalesce(v_loan.investor_amount,0)-v_loan.writeoff_investor_capital);
 v_capital_base:=greatest(v_investor_capital,v_loan.cost_amount-coalesce(v_loan.down_payment,0)-v_prior_capital_loss);
 if v_capital_loss>v_capital_base then raise exception 'Списание превышает оставшийся капитал'; end if;
 if v_capital_loss>0 and p_accept_capital_loss is distinct from true then raise exception 'Требуется подтверждение потери капитала'; end if;
 v_investor_capital_loss:=case when v_capital_base>0 then
   least(v_investor_capital,round(v_capital_loss*v_investor_capital/v_capital_base,2)) else 0 end;
 -- Forgive latest outstanding installments first. Neither payment rows nor cash are changed.
 v_left:=p_amount;
 for v_schedule in select * from public.payment_schedules
   where loan_id=p_loan_id and organization_id=v_org and status<>'paid' order by sequence_number desc
 loop
   exit when v_left<=0;
   v_paid:=coalesce(v_schedule.paid_amount,0);
   v_take:=least(v_left,greatest(0,v_schedule.amount-v_paid));
   if v_take<=0 then continue; end if;
   update public.payment_schedules set amount=v_schedule.amount-v_take,
     written_off_amount=v_schedule.written_off_amount+v_take,
     paid_amount=v_paid,
     status=case when v_schedule.amount-v_take<=v_paid then 'paid' else v_schedule.status end
   where id=v_schedule.id and organization_id=v_org;
   v_left:=v_left-v_take;
 end loop;
 if v_left<>0 then raise exception 'Не удалось распределить списание'; end if;
 v_entry:=jsonb_build_object('id',p_request_id,'occurred_at',now(),'actor_id',v_uid,'amount',p_amount,
   'mode',p_mode,'reason',btrim(p_reason),'owner_profit_loss',v_owner_loss,'investor_profit_loss',v_investor_loss,
   'owner_capital_loss',v_capital_loss-v_investor_capital_loss,'investor_capital_loss',v_investor_capital_loss);
 update public.loans set debt_written_off=debt_written_off+p_amount,
   writeoff_owner_profit=writeoff_owner_profit+v_owner_loss,
   writeoff_investor_profit=writeoff_investor_profit+v_investor_loss,
   writeoff_investor_capital=writeoff_investor_capital+v_investor_capital_loss,
   writeoff_history=writeoff_history||jsonb_build_array(v_entry),
   status=case when p_amount=v_remaining then 'closed' else status end
 where id=p_loan_id and organization_id=v_org;
 return v_entry;
end;
$$;
revoke all on function public.write_off_loan_debt(uuid,numeric,numeric,bigint,text,text,boolean,uuid) from public,anon;
grant execute on function public.write_off_loan_debt(uuid,numeric,numeric,bigint,text,text,boolean,uuid) to authenticated;
revoke all on function public.guard_loan_writeoff_history() from public,anon,authenticated;
revoke all on function public.guard_schedule_writeoff_history() from public,anon,authenticated;

-- Patch the currently installed RPC, preserving its security and subscription checks.
-- Fail the migration if its implementation has unexpectedly changed.
do $$
declare
 v_def text:=pg_get_functiondef('public.record_payment(uuid,numeric,timestamptz,text,text,text,text)'::regprocedure);
 v_old text:='v_financed := round(greatest(0, v_loan.principal - coalesce(v_loan.down_payment, 0)), 2);';
 v_new text:='v_financed := round(greatest(0, v_loan.principal - coalesce(v_loan.down_payment, 0) - coalesce(v_loan.debt_written_off, 0)), 2);';
begin
 if strpos(v_def,v_new)>0 then return; end if;
 if strpos(v_def,v_old)=0 then raise exception 'record_payment implementation changed; review before installing write-offs'; end if;
 execute replace(v_def,v_old,v_new);
end;
$$;
-- Reject all loan edits, including older offline clients, before any schedule mutation.
do $$
declare
 v_def text:=pg_get_functiondef('public.edit_loan_transaction(uuid,uuid,jsonb,jsonb,jsonb,jsonb,numeric)'::regprocedure);
 v_anchor text:='raise exception ''Loan not found'';' || chr(10) || '  end if;';
 v_guard text:=chr(10)||'  if v_loan.debt_written_off > 0 then raise exception ''Условия рассрочки со списаниями нельзя изменять''; end if;';
begin
 if strpos(v_def,'if v_loan.debt_written_off > 0')>0 then return; end if;
 if strpos(v_def,v_anchor)=0 then raise exception 'edit_loan_transaction implementation changed; review before installing write-offs'; end if;
 execute replace(v_def,v_anchor,v_anchor||v_guard);
end;
$$;
commit;
