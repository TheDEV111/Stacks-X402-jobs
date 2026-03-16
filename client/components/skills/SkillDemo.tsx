"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { PaymentButton } from "@/components/payment/PaymentButton";
import type { SerializableSkill } from "@/types/skill";

interface SkillDemoProps {
  skill: SerializableSkill;
}

const FIELD_OPTIONS: Record<string, string[]> = {
  timeframe: ["24h", "7d", "30d"],
  tone: ["professional", "casual", "technical"],
  analysisDepth: ["basic", "detailed"],
  category: ["all", "bitcoin", "stacks", "defi"],
};

function JsonBlock({ data, label }: { data: unknown; label: string }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Copy"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm font-mono leading-relaxed">
        <code>{json}</code>
      </pre>
    </div>
  );
}

export function SkillDemo({ skill }: SkillDemoProps) {
  const [result, setResult] = useState<unknown>(null);
  const [input, setInput] = useState<Record<string, unknown>>(
    (skill.exampleInput as Record<string, unknown>) ?? {}
  );

  const updateField = (key: string, value: unknown) => {
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  const endpointWithQuery =
    skill.method === "GET"
      ? `${skill.endpoint}?${new URLSearchParams(
          Object.entries(input).map(([key, value]) => [
            key,
            typeof value === "string" ? value : JSON.stringify(value),
          ])
        ).toString()}`
      : skill.endpoint;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Try it out</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {skill.method} {skill.endpoint}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="input">
          <TabsList className="mb-4">
            <TabsTrigger value="input">Input Form</TabsTrigger>
            <TabsTrigger value="output">Example Output</TabsTrigger>
          </TabsList>

          <TabsContent value="input" className="mt-0">
            <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
              {Object.entries(input).map(([key, value]) => {
                const options = FIELD_OPTIONS[key];

                return (
                  <div key={key} className="space-y-1.5">
                    <label
                      htmlFor={`field-${key}`}
                      className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {key}
                    </label>

                    {options && typeof value === "string" ? (
                      <select
                        id={`field-${key}`}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={value}
                        onChange={(e) => updateField(key, e.target.value)}
                      >
                        {options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : Array.isArray(value) ? (
                      <Input
                        id={`field-${key}`}
                        value={value.join(",")}
                        onChange={(e) =>
                          updateField(
                            key,
                            e.target.value
                              .split(",")
                              .map((v) => v.trim())
                              .filter(Boolean)
                          )
                        }
                        placeholder="comma,separated,values"
                      />
                    ) : typeof value === "boolean" ? (
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          id={`field-${key}`}
                          type="checkbox"
                          checked={value}
                          onChange={(e) => updateField(key, e.target.checked)}
                        />
                        {value ? "true" : "false"}
                      </label>
                    ) : typeof value === "number" ? (
                      <Input
                        id={`field-${key}`}
                        type="number"
                        value={String(value)}
                        onChange={(e) => updateField(key, Number(e.target.value))}
                      />
                    ) : typeof value === "object" && value !== null ? (
                      <textarea
                        id={`field-${key}`}
                        className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
                        value={JSON.stringify(value, null, 2)}
                        onChange={(e) => {
                          try {
                            updateField(key, JSON.parse(e.target.value));
                          } catch {
                            // Keep last valid JSON to avoid invalid payload state.
                          }
                        }}
                      />
                    ) : (
                      <Input
                        id={`field-${key}`}
                        value={String(value)}
                        onChange={(e) => updateField(key, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}

              <JsonBlock data={input} label="Live request payload" />
            </div>
          </TabsContent>

          <TabsContent value="output" className="mt-0">
            <JsonBlock
              data={result ?? skill.exampleOutput}
              label={result ? "Live result" : "Example response"}
            />
          </TabsContent>
        </Tabs>

        {/* Payment-integrated execute button */}
        <div className="mt-5">
          <PaymentButton
            skillId={skill.id}
            endpoint={endpointWithQuery}
            priceMicroSTX={skill.priceMicroSTX}
            body={skill.method === "POST" ? input : undefined}
            onResult={setResult}
          />
        </div>
        <p className="text-xs text-center text-muted-foreground mt-2">
          Payment is atomic via x402 facilitator. You sign — we settle.
        </p>
      </CardContent>
    </Card>
  );
}
