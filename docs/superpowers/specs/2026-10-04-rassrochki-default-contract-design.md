# Rassrochki Default Contract Sample Design

## Goal

Provide a polished printable contract for a sale paid in installments, based on the user's photographed form. When an organization has no saved contract template, opening a loan's contract editor uses this built-in sample.

## Template fallback

Resolve the template at contract-opening time. A blank or whitespace-only `organization_settings.contract_template` selects the built-in sample. A non-empty saved template continues to take precedence and is not rewritten. The built-in template is not copied into organization settings, so this requires no database migration.

The built-in sample opens on a formatted preview in the existing contract modal, with a switch to edit its text. Preview updates from the edited text, and the print action uses the same A4 layout. Its small, escaped markup vocabulary supports a centered title, section headings, two-column party details, and a payment table. Existing custom templates keep their current text-editing and plain-text printing behavior. The print iframe and the in-page print fallback use the same renderer.

## Contract content and layout

The printed page follows the form's information order while using balanced margins and centered hierarchy:

1. Centered “РАССРОЧКА” label and “Договор купли-продажи товара с оплатой в рассрочку” title, followed by contract number and date.
2. Seller and buyer details in adjacent blocks. The seller name comes from the organization; its address, phone, and payment details remain blank fields for the organization to complete. Buyer name and phone come from the loan. Guarantor details come from the loan's guarantors.
3. Product name and a compact summary of contract amount, first payment, and term.
4. A ruled payment table with installment number, due date, amount, and a space for signature. Rows show the plan only, without “ожидает”, “оплачен”, or “просрочен” state labels.
5. Early repayment and default terms, followed by seller, buyer, and guarantor signature lines.

The sample's default terms are:

> Покупатель вправе досрочно оплатить оставшуюся сумму.
>
> При просрочке платежей Продавец вправе требовать исполнения обязательств и применять способы защиты в случаях и порядке, предусмотренных законодательством. Возврат товара, взыскание задолженности и ответственность поручителя определяются законом и соглашением о поручительстве.

The photographed seller's and customer's personal details will not be copied into the reusable sample. The photo's direct assertion that the seller may take the buyer's or guarantor's property is omitted; the sample instead refers to legal remedies and the surety agreement. This follows the distinction in Civil Code articles [489](https://www.consultant.ru/document/cons_doc_LAW_9027/9c26fdbf02d603897feff835b0b6aaa623e13d93/) and [237](https://www.consultant.ru/document/cons_doc_LAW_5142/09cb7c2052330e07fafcb41b1e64861281fba5de/): installment-sale remedies are subject to statutory conditions, and property recovery generally follows the procedure established by law.

## Data mapping

Reuse existing placeholders for organization, buyer, phone, amount, first payment, term, start date, and guarantors. Add `{product}` from `loan.title` and `{payment_schedule}` from schedule rows. Keep the existing `{schedule}` placeholder unchanged for custom templates. The new payment schedule formatter emits each due date and amount without payment status. Seller address, phone, payment details, and contract number remain printable blank lines because the current organization settings do not store them.

## Scope

No settings UI or database changes. Custom templates remain editable and retain their current precedence. The printable layout remains usable on phones and targets a standard A4 page when printed. The formatted sample preview and print output must not interpret arbitrary template text as HTML.

## Verification

Build the `rassrochki` app. Inspect the printed HTML and in-page fallback, confirm the blank-template sample is centered with a payment table, and confirm a saved custom template still prints through the existing plain-text path.
