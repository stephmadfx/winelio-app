import { redirect } from "next/navigation";

export default function TermsRedirectPage() {
  redirect("/documents-legaux/conditions-generales-utilisation");
}
