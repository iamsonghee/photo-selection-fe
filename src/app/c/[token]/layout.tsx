import CustomerLayoutClient from "./CustomerLayoutClient";
import "./customer-shell.css";

export default function CustomerTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CustomerLayoutClient>{children}</CustomerLayoutClient>;
}
