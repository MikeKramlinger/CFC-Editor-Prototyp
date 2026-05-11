import { describe, expect, it } from "vitest";
import { formatErrorMessage } from "../../src/formats/errors.js";

describe("formatErrorMessage", () => {
  it("returns the localized duplicate message", () => {
    const message = formatErrorMessage(
      {
        line: 3,
        messageKey: "formatErrorDuplicateNodeId",
        message: "ID mehrfach belegt.",
      },
      (key) => key === "formatErrorDuplicateNodeId" ? "ID mehrfach belegt." : key,
    );

    expect(message).toBe("ID mehrfach belegt.");
  });
});
