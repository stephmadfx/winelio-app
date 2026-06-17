declare module "mjml" {
  export type MjmlError = {
    line?: number;
    message: string;
    tagName?: string;
    formattedMessage?: string;
  };

  export type MjmlOutput = {
    html: string;
    json?: unknown;
    errors: MjmlError[];
  };

  export default function mjml2html(
    mjml: string,
    options?: Record<string, unknown>
  ): Promise<MjmlOutput>;
}
