import { expect, it } from "vitest";
import { linkParts } from "./links";

it("plain text is one part", () => {
  expect(linkParts("Practice the chorus")).toEqual([
    { text: "Practice the chorus" },
  ]);
});

it("finds web links among the text", () => {
  expect(
    linkParts(
      "Song: https://youtu.be/abc123 tab: http://tabs.example.com/w?id=7",
    ),
  ).toEqual([
    { text: "Song: " },
    { text: "https://youtu.be/abc123", href: "https://youtu.be/abc123" },
    { text: " tab: " },
    {
      text: "http://tabs.example.com/w?id=7",
      href: "http://tabs.example.com/w?id=7",
    },
  ]);
});

it("leaves trailing punctuation out of a link", () => {
  expect(linkParts("See https://example.com/tab.")).toEqual([
    { text: "See " },
    { text: "https://example.com/tab", href: "https://example.com/tab" },
    { text: "." },
  ]);
  expect(linkParts("(https://example.com/x)")).toEqual([
    { text: "(" },
    { text: "https://example.com/x", href: "https://example.com/x" },
    { text: ")" },
  ]);
});

it("only http and https become links", () => {
  expect(linkParts("javascript:alert(1) ftp://x.org")).toEqual([
    { text: "javascript:alert(1) ftp://x.org" },
  ]);
});

it("keeps line breaks in the text", () => {
  expect(linkParts("Intro\nhttps://a.com\nVerse")).toEqual([
    { text: "Intro\n" },
    { text: "https://a.com", href: "https://a.com" },
    { text: "\nVerse" },
  ]);
});
