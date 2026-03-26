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
    bg: "from-kiparlo-orange/10 to-kiparlo-orange/5",
    border: "border-kiparlo-orange/20",
    text: "text-kiparlo-orange",
    iconBg: "bg-kiparlo-orange/15",
  },
  amber: {
    bg: "from-kiparlo-amber/10 to-kiparlo-amber/5",
    border: "border-kiparlo-amber/20",
    text: "text-kiparlo-amber",
    iconBg: "bg-kiparlo-amber/15",
  },
  dark: {
    bg: "from-kiparlo-dark/10 to-kiparlo-dark/5",
    border: "border-kiparlo-dark/20",
    text: "text-kiparlo-dark",
    iconBg: "bg-kiparlo-dark/15",
  },
  gray: {
    bg: "from-kiparlo-gray/10 to-kiparlo-gray/5",
    border: "border-kiparlo-gray/20",
    text: "text-kiparlo-gray",
    iconBg: "bg-kiparlo-gray/15",
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
        <p className="text-sm font-medium text-kiparlo-gray">{title}</p>
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
