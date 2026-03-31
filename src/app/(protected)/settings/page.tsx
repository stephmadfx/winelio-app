"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-kiparlo-dark">Paramètres</h2>
        <p className="text-sm text-kiparlo-gray mt-1">Personnalisez votre expérience</p>
      </div>

      {/* Apparence */}
      <Card className="!rounded-2xl mb-4">
       <CardContent className="p-5 sm:p-6">
        <h3 className="text-base font-semibold text-kiparlo-dark mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-kiparlo-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          Apparence
        </h3>

        {mounted && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTheme("light")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                theme === "light"
                  ? "border-kiparlo-orange bg-kiparlo-orange/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              {/* Aperçu mode clair */}
              <div className="w-full h-16 rounded-lg bg-white border border-gray-200 overflow-hidden shadow-sm">
                <div className="h-4 bg-[#2D3436]" />
                <div className="p-1.5 space-y-1">
                  <div className="h-2 bg-gray-200 rounded w-3/4" />
                  <div className="h-2 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-kiparlo-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
                </svg>
                <span className={`text-sm font-medium ${theme === "light" ? "text-kiparlo-orange" : "text-kiparlo-gray"}`}>
                  Clair
                </span>
                {theme === "light" && (
                  <svg className="w-4 h-4 text-kiparlo-orange ml-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>

            <button
              onClick={() => setTheme("dark")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                theme === "dark"
                  ? "border-kiparlo-orange bg-kiparlo-orange/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              {/* Aperçu mode sombre */}
              <div className="w-full h-16 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden">
                <div className="h-4 bg-[#2D3436]" />
                <div className="p-1.5 space-y-1">
                  <div className="h-2 bg-slate-700 rounded w-3/4" />
                  <div className="h-2 bg-slate-800 rounded w-1/2" />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-kiparlo-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span className={`text-sm font-medium ${theme === "dark" ? "text-kiparlo-orange" : "text-kiparlo-gray"}`}>
                  Sombre
                </span>
                {theme === "dark" && (
                  <svg className="w-4 h-4 text-kiparlo-orange ml-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-4">
          Le mode sombre réduit la fatigue oculaire dans les environnements peu éclairés.
        </p>
       </CardContent>
      </Card>

      {/* Infos app */}
      <Card className="!rounded-2xl">
        <CardContent className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-kiparlo-dark mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-kiparlo-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            À propos
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Application</span>
              <span className="font-medium text-kiparlo-dark">Kiparlo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium text-kiparlo-dark">1.0.0</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
