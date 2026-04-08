"use client";

interface WalletCardProps {
  title: string;
  amount: number;
  currency?: string;
  color: "orange" | "amber" | "dark" | "gray";
  icon: string;
}

const colorMap = {
  orange: {
    bg: "from-winelio-orange/10 to-winelio-orange/5",
    border: "border-winelio-orange/20",
    text: "text-winelio-orange",
    iconBg: "bg-winelio-orange/15",
  },
  amber: {
    bg: "from-winelio-amber/10 to-winelio-amber/5",
    border: "border-winelio-amber/20",
    text: "text-winelio-amber",
    iconBg: "bg-winelio-amber/15",
  },
  dark: {
    bg: "from-winelio-dark/10 to-winelio-dark/5",
    border: "border-winelio-dark/20",
    text: "text-winelio-dark",
    iconBg: "bg-winelio-dark/15",
  },
  gray: {
    bg: "from-winelio-gray/10 to-winelio-gray/5",
    border: "border-winelio-gray/20",
    text: "text-winelio-gray",
    iconBg: "bg-winelio-gray/15",
  },
};

export function WalletCard({
  title,
  amount,
  currency = "EUR",
  color,
  icon,
}: WalletCardProps) {
  const styles = colorMap[color];

  const formattedAmount = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);

  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br ${styles.bg} ${styles.border} p-6`}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-winelio-gray">{title}</p>
        <div
          className={`w-10 h-10 rounded-xl ${styles.iconBg} flex items-center justify-center`}
        >
          <svg
            className={`w-5 h-5 ${styles.text}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d={icon}
            />
          </svg>
        </div>
      </div>
      <p className={`text-2xl font-bold ${styles.text}`}>{formattedAmount}</p>
    </div>
  );
}
