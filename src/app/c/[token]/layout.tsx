import CustomerLayoutClient from "./CustomerLayoutClient";

export default function CustomerTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CustomerLayoutClient>{children}</CustomerLayoutClient>;
}
