/** Responsables des validations, indépendamment des anciens libellés en base. */
export function recommendationStepRole(order: number): "PROFESSIONAL" | "REFERRER" | null {
  if ([1, 2, 5, 7].includes(order)) return "PROFESSIONAL";
  if ([3, 4, 6, 8].includes(order)) return "REFERRER";
  return null;
}
