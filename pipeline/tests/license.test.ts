import { describe, expect, it } from "vitest";
import { verifyLicense } from "../src/images/license";

describe("verifyLicense", () => {
  it.each([
    [{ name: "CC BY-SA 4.0" }, "cc-by-sa"],
    [{ name: "CC BY 2.0" }, "cc-by"],
    [{ name: "by" }, "cc-by"],
    [{ name: "by-sa" }, "cc-by-sa"],
    [{ name: "CC0" }, "cc0"],
    [{ name: "Public domain" }, "public-domain"],
    [{ name: "pdm" }, "public-domain"],
    [{ name: "PD-USGov" }, "public-domain"],
    [{ url: "https://creativecommons.org/licenses/by-sa/3.0/" }, "cc-by-sa"],
    [{ url: "https://creativecommons.org/publicdomain/zero/1.0/" }, "cc0"],
    [{ name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" }, "cc-by"],
  ] as const)("accepts %j as %s", (raw, expected) => {
    expect(verifyLicense(raw)).toBe(expected);
  });

  it.each([
    [{ name: "CC BY-NC 2.0" }],
    [{ name: "CC BY-ND 4.0" }],
    [{ name: "CC BY-NC-SA 3.0" }],
    [{ name: "by-nc" }],
    [{ name: "Fair use" }],
    [{ name: "All rights reserved" }],
    [{ name: "Some custom license" }],
    [{ name: "" }],
    [{}],
    [{ name: null, url: null }],
    [{ url: "https://creativecommons.org/licenses/by-nc/4.0/" }],
    [{ url: "https://example.com/licenses/by/4.0/" }],
    [{ url: "not a url" }],
  ] as const)("rejects %j", (raw) => {
    expect(verifyLicense(raw)).toBeNull();
  });

  it("rejects when name and URL disagree", () => {
    expect(
      verifyLicense({ name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" }),
    ).toBeNull();
  });
});
