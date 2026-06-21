import FiscalShell from "../../ui/fiscal-shell";

export const dynamic = "force-dynamic";

const sectionMap = {
  invoice: "invoice",
  services: "services",
  alerts: "alerts",
  cycles: "cycles",
  clients: "clients",
  financeiro: "financeiro",
} as const;

type SectionKey = keyof typeof sectionMap;

export default function FiscalSectionPage({ params }: { params: { section: string } }) {
  const section = sectionMap[params.section as SectionKey];
  if (!section) {
    return <FiscalShell section="dashboard" />;
  }
  return <FiscalShell section={section} />;
}
