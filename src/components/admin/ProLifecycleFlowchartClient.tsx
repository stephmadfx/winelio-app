"use client";

import dynamic from "next/dynamic";
import { type FlowAnnotation } from "./FlowAnnotationDialog";

const ProLifecycleFlowchartDynamic = dynamic(
  () => import("./ProLifecycleFlowchart").then((m) => ({ default: m.ProLifecycleFlowchart })),
  { ssr: false }
);

export function ProLifecycleFlowchartClient({ annotations }: { annotations: FlowAnnotation[] }) {
  return <ProLifecycleFlowchartDynamic annotations={annotations} />;
}
