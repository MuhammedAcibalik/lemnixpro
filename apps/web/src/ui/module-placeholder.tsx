import { Card, CardContent } from "@/components/ui/card";

import { PageHeader } from "./page-header";
import { Panel } from "./panel";

type ModulePlaceholderProps = {
  title: string;
  eyebrow: string;
  description: string;
  nextStep: string;
};

export function ModulePlaceholder({
  title,
  eyebrow,
  description,
  nextStep
}: ModulePlaceholderProps) {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        badge={{ label: "Hazırlanıyor", tone: "planned" }}
      />
      <Panel
        title="Planlanan kapsam"
        description="Bu yüzey navigasyonda görünür durumda tutuluyor; bilgi mimarisi ilk günden sabit kalıyor."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <PlaceholderCard
            index="01"
            title="UI iskeleti hazır"
            text="Shell, rota ve görsel dil bu modül için ayrılmış durumda."
          />
          <PlaceholderCard
            index="02"
            title="Sonraki gerçek iş"
            text={nextStep}
          />
        </div>
      </Panel>
    </div>
  );
}

function PlaceholderCard({
  index,
  text,
  title
}: {
  index: string;
  text: string;
  title: string;
}) {
  return (
    <Card className="shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <CardContent className="grid gap-2 p-4">
        <span className="font-mono text-xs font-semibold text-primary">{index}</span>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
