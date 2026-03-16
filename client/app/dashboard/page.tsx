"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  clearExecutionHistory,
  getExecutionHistory,
  type ExecutionHistoryItem,
} from "@/lib/execution-history";
import { formatSTX, formatTimestamp } from "@/lib/utils/format";
import { getExplorerUrl } from "@/lib/stacks/network";

export default function DashboardPage() {
  const [items, setItems] = useState<ExecutionHistoryItem[]>(() =>
    getExecutionHistory()
  );

  const totals = useMemo(() => {
    const totalExecutions = items.length;
    const successes = items.filter((i) => i.status === "success").length;
    const totalSpent = items
      .filter((i) => i.status === "success")
      .reduce((sum, i) => sum + i.priceMicroSTX, 0);

    return { totalExecutions, successes, totalSpent };
  }, [items]);

  return (
    <main className="container mx-auto px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Execution Dashboard</h1>
          <p className="mt-2 text-muted-foreground">
            Local run history for paid skill executions and transaction proofs.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            clearExecutionHistory();
            setItems([]);
          }}
          disabled={items.length === 0}
        >
          <Trash2 className="h-4 w-4" />
          Clear History
        </Button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Executions
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totals.totalExecutions}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Successful</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totals.successes}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Spent</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatSTX(totals.totalSpent)}</CardContent>
        </Card>
      </div>

      <div className="mt-8 rounded-lg border">
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[1fr_1.1fr_0.8fr_0.8fr_1.4fr_1.6fr] gap-2 border-b bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Skill</span>
              <span>Time</span>
              <span>Status</span>
              <span>Price</span>
              <span>Transaction</span>
              <span>Preview</span>
            </div>

            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No executions yet. Go to <Link href="/skills" className="text-primary hover:underline">/skills</Link> and run a skill.
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_1.1fr_0.8fr_0.8fr_1.4fr_1.6fr] items-center gap-2 border-b px-4 py-3 text-sm last:border-b-0"
                >
                  <span className="font-medium">{item.skillId}</span>
                  <span className="text-muted-foreground">{formatTimestamp(item.createdAt)}</span>
                  <Badge variant={item.status === "success" ? "default" : "destructive"} className="w-fit">
                    {item.status}
                  </Badge>
                  <span>{formatSTX(item.priceMicroSTX)}</span>
                  {item.txHash ? (
                    <a
                      href={getExplorerUrl(item.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                    >
                      {item.txHash.slice(0, 10)}...{item.txHash.slice(-6)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">N/A</span>
                  )}
                  <span className="truncate text-xs text-muted-foreground">
                    {item.resultPreview ?? item.requestPreview ?? "-"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
