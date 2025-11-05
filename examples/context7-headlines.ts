#!/usr/bin/env tsx

/**
 * Example: fetch the README for a React-adjacent package from Context7
 * and print only the markdown headlines.
 */

import { createRuntime } from "../src/runtime.js";

async function main(): Promise<void> {
  const runtime = await createRuntime();
  try {
    const [{ structuredContent: libraries }] = (await runtime.callTool(
      "context7",
      "resolve-library-id",
      {
        args: { libraryName: "react" },
      },
    )) as [{ structuredContent?: Array<{ id: string }> }];

    const target = libraries?.[0]?.id;
    if (!target) {
      console.error("No library ID resolved for React.");
      return;
    }

    const docs = (await runtime.callTool("context7", "get-library-docs", {
      args: { context7CompatibleLibraryID: target },
    })) as [
      {
        structuredContent?: { markdown?: string };
      },
    ];

    const markdown = docs[0]?.structuredContent?.markdown ?? "";
    const headlines = markdown
      .split("\n")
      .filter((line) => /^#+\s/.test(line))
      .join("\n");

    console.log(`# Headlines for ${target}`);
    console.log(headlines || "(no headlines found)");
  } finally {
    await runtime.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
