import { LoanForm } from "@/components/LoanForm";

export default async function EditLoanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LoanForm loanId={id} />;
}
