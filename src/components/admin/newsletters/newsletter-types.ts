export type NewsletterTemplate = {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  mjmlContent: string;
  htmlContent: string;
  projectData: Record<string, unknown>;
  status: "draft" | "ready" | "archived";
  updatedAt: string;
};

export type NewsletterEditorInitial = NewsletterTemplate | null;

export type NewsletterAudienceCategory = {
  id: string;
  name: string;
};

export type NewsletterTestEmailPreset = {
  label: string;
  email: string;
};
