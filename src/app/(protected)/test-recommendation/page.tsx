"use client";

import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";

export default function TestRecommendationPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    getUser();
  }, []);

  const testInsert = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      console.log("[TEST] Starting insert with userId:", userId);

      if (!userId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) throw new Error("No user authenticated");
        setUserId(user.id);
      }

      // Test 1: Try without schema
      console.log("[TEST] Attempting insert WITHOUT .schema()...");
      const { data: testData, error: testError } = await supabase
        .from("recommendations")
        .insert({
          referrer_id: userId!,
          professional_id: "00000000-0000-0000-0000-000000000001",
          contact_id: "00000000-0000-0000-0000-000000000001",
          project_description: "TEST",
          urgency_level: "normal",
          status: "PENDING",
        })
        .select("id")
        .single();

      console.log("[TEST] Response:", { data: testData, error: testError });
      setResponse({ data: testData, error: testError });

      if (testError) {
        setError(`Error: ${testError.message} | Code: ${testError.code} | Details: ${JSON.stringify(testError.details)}`);
      } else {
        setError(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[TEST] Exception:", msg, err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Test Recommendation Insert</h1>

      <div className="mb-4 p-4 bg-gray-100 rounded">
        <p className="text-sm"><strong>User ID:</strong> {userId || "Loading..."}</p>
      </div>

      <button
        onClick={testInsert}
        disabled={!userId || loading}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {loading ? "Testing..." : "Test Insert"}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <p className="font-bold">Error:</p>
          <pre className="mt-2 text-xs overflow-auto">{error}</pre>
        </div>
      )}

      {response && (
        <div className="mt-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          <p className="font-bold">Response:</p>
          <pre className="mt-2 text-xs overflow-auto">{JSON.stringify(response, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
