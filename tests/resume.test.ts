import { describe, expect, test, afterEach } from "bun:test";
import { JsonExporter } from "../src/exporters/json.js";
import { JsonlExporter } from "../src/exporters/jsonl.js";
import { CsvExporter } from "../src/exporters/csv.js";
import { readHead, readTail, countLines, readFile, writeFile } from "../src/utils/fs.js";
import { unlink } from "node:fs/promises";

const TEST_FILES: string[] = [];

function registerTempFile(path: string): string {
  TEST_FILES.push(path);
  return path;
}

afterEach(async () => {
  for (const file of TEST_FILES) {
    try {
      await unlink(file);
    } catch {}
  }
  TEST_FILES.length = 0;
});

describe("fs utilities", () => {
  test("readHead and readTail read correctly", async () => {
    const filePath = registerTempFile(`/tmp/test_fs_${Date.now()}.txt`);
    const content = "0123456789abcdefghijklmnopqrstuvwxyz";
    await writeFile(filePath, content);

    const head = await readHead(filePath, 10);
    expect(head).toBe("0123456789");

    const tail = await readTail(filePath, 10);
    expect(tail).toBe("qrstuvwxyz");
  });

  test("countLines accurately counts newlines", async () => {
    const filePath = registerTempFile(`/tmp/test_lines_${Date.now()}.txt`);
    await writeFile(filePath, "line 1\nline 2\nline 3\n");

    const count = await countLines(filePath);
    expect(count).toBe(3);
  });
});

describe("JsonExporter resume", () => {
  test("parseResumeInfo extracts info in milliseconds without loading full file", async () => {
    const filePath = registerTempFile(`/tmp/test_export_${Date.now()}.json`);
    const messages = [
      { id: "100", channel_id: "channel_abc", content: "newest" },
      { id: "99", channel_id: "channel_abc", content: "middle" },
      { id: "98", channel_id: "channel_abc", content: "oldest" },
    ];

    const exporter = new JsonExporter();
    await exporter.open(filePath, { streaming: true });
    await exporter.write(messages);
    await exporter.close();

    const resumeInfo = await exporter.parseResumeInfo(filePath);
    expect(resumeInfo.channelId).toBe("channel_abc");
    expect(resumeInfo.lastMessageId).toBe("98");
    expect(resumeInfo.existingMessageCount).toBe(3);
  });

  test("parseResumeInfo handles interrupted/unclosed JSON gracefully", async () => {
    const filePath = registerTempFile(`/tmp/test_interrupted_${Date.now()}.json`);
    const unclosed = `{
  "exportedAt": "2026-10-11T12:00:00.000Z",
  "messageCount": 2,
  "messages": [
    {
      "id": "100",
      "channel_id": "channel_xyz",
      "content": "first"
    },
    {
      "id": "99",
      "channel_id": "channel_xyz",
      "content": "second"
    }`; // No closing ]}
    await writeFile(filePath, unclosed);

    const exporter = new JsonExporter();
    const resumeInfo = await exporter.parseResumeInfo(filePath);
    expect(resumeInfo.channelId).toBe("channel_xyz");
    expect(resumeInfo.lastMessageId).toBe("99");
  });

  test("openForResume and write append new messages without rewriting entire file", async () => {
    const filePath = registerTempFile(`/tmp/test_append_${Date.now()}.json`);
    const initialBatch = [
      { id: "100", channel_id: "chan_1", content: "msg 100" },
      { id: "99", channel_id: "chan_1", content: "msg 99" },
    ];

    const exporter1 = new JsonExporter();
    await exporter1.open(filePath, { streaming: true });
    await exporter1.write(initialBatch);
    await exporter1.close();

    // Now resume
    const exporter2 = new JsonExporter();
    const resumeInfo = await exporter2.parseResumeInfo(filePath);
    await exporter2.openForResume(filePath, resumeInfo, { streaming: true });

    const newBatch = [
      { id: "98", channel_id: "chan_1", content: "msg 98" },
      { id: "97", channel_id: "chan_1", content: "msg 97" },
    ];
    await exporter2.write(newBatch);
    await exporter2.close();

    // Verify resulting JSON is valid and contains all 4 messages
    const text = await readFile(filePath);
    const parsed = JSON.parse(text);
    expect(parsed.messages.length).toBe(4);
    expect(parsed.messages.map((m: any) => m.id)).toEqual(["100", "99", "98", "97"]);
  });
});

describe("JsonlExporter resume", () => {
  test("parseResumeInfo extracts info and counts messages with head/tail", async () => {
    const filePath = registerTempFile(`/tmp/test_export_${Date.now()}.jsonl`);
    const messages = [
      { id: "200", channel_id: "chan_jsonl", content: "msg 200" },
      { id: "199", channel_id: "chan_jsonl", content: "msg 199" },
      { id: "198", channel_id: "chan_jsonl", content: "msg 198" },
    ];

    const exporter = new JsonlExporter();
    await exporter.open(filePath, { streaming: true });
    await exporter.write(messages);
    await exporter.close();

    const resumeInfo = await exporter.parseResumeInfo(filePath);
    expect(resumeInfo.channelId).toBe("chan_jsonl");
    expect(resumeInfo.lastMessageId).toBe("198");
    expect(resumeInfo.existingMessageCount).toBe(3);
  });

  test("openForResume and write append new lines seamlessly", async () => {
    const filePath = registerTempFile(`/tmp/test_append_${Date.now()}.jsonl`);
    const initial = [
      { id: "200", channel_id: "chan_jsonl", content: "msg 200" },
    ];

    const exporter1 = new JsonlExporter();
    await exporter1.open(filePath, { streaming: true });
    await exporter1.write(initial);
    await exporter1.close();

    const exporter2 = new JsonlExporter();
    const resumeInfo = await exporter2.parseResumeInfo(filePath);
    await exporter2.openForResume(filePath, resumeInfo, { streaming: true });
    await exporter2.write([{ id: "199", channel_id: "chan_jsonl", content: "msg 199" }]);
    await exporter2.close();

    const text = await readFile(filePath);
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(3); // 1 metadata line + 2 message lines
  });
});

describe("CsvExporter resume", () => {
  test("parseResumeInfo extracts info from CSV header and tail", async () => {
    const filePath = registerTempFile(`/tmp/test_export_${Date.now()}.csv`);
    const messages = [
      { id: "300", channel_id: "chan_csv", content: "msg 300" },
      { id: "299", channel_id: "chan_csv", content: "msg 299" },
    ];

    const exporter = new CsvExporter();
    await exporter.open(filePath, { streaming: true });
    await exporter.write(messages);
    await exporter.close();

    const resumeInfo = await exporter.parseResumeInfo(filePath);
    expect(resumeInfo.channelId).toBe("chan_csv");
    expect(resumeInfo.lastMessageId).toBe("299");
    expect(resumeInfo.existingMessageCount).toBe(2);
  });
});
