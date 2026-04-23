"use client";

import dynamic from "next/dynamic";
import { type FlowAnnotation } from "./FlowAnnotationDialog";

const RecoFlowchartDynamic = dynamic(
  () => import("./RecoFlowchart").then((m) => ({ default: m.RecoFlowchart })),
  { ssr: false }
);

export function RecoFlowchartClient({ annotations }: { annotations: FlowAnnotation[] }) {
  return <RecoFlowchartDynamic annotations={annotations} />;
}
