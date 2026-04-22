import { describe, expect, it } from "vitest";

import { getHourInTimeZone, resolveContour } from "@hori/core";

describe("response budget quiet hours", () => {
  it("uses Europe/Moscow for quiet-hours hour resolution", () => {
    expect(getHourInTimeZone(new Date("2026-04-19T04:22:00.000Z"))).toBe(7);
    expect(getHourInTimeZone(new Date("2026-04-19T07:22:00.000Z"))).toBe(10);
  });

  it("does not force replies to Hori into template-only contour during quiet hours", () => {
    const contour = resolveContour({
      messageKind: "reply_to_bot",
      currentHour: 7,
      quietHoursEnabled: true,
      triggerSource: "reply"
    });

    expect(contour).toEqual({ contour: "B", reason: "kind:reply_to_bot" });
  });

  it("does not force explicit invocations into template-only contour during quiet hours", () => {
    const contour = resolveContour({
      messageKind: "casual_address",
      currentHour: 7,
      quietHoursEnabled: true,
      explicitInvocation: true
    });

    expect(contour).toEqual({ contour: "B", reason: "kind:casual_address" });
  });

  it("does not force name mentions into template-only contour during quiet hours", () => {
    const contour = resolveContour({
      messageKind: "smalltalk_hangout",
      currentHour: 7,
      quietHoursEnabled: true,
      mentionsBotByName: true,
      triggerSource: "name"
    });

    expect(contour).toEqual({ contour: "B", reason: "kind:smalltalk_hangout" });
  });

  it("keeps quiet-hours template contour for background auto-interjects", () => {
    const contour = resolveContour({
      messageKind: "smalltalk_hangout",
      currentHour: 7,
      quietHoursEnabled: true,
      triggerSource: "auto_interject"
    });

    expect(contour).toEqual({ contour: "A", reason: "quiet_hours:auto_interject" });
  });

  it("keeps the message-kind mapping outside quiet hours", () => {
    expect(resolveContour({ messageKind: "info_question", currentHour: 12, quietHoursEnabled: true }).contour).toBe("B");
    expect(resolveContour({ messageKind: "direct_mention", currentHour: 12, quietHoursEnabled: true }).contour).toBe("B");
    expect(resolveContour({ messageKind: "meta_feedback", currentHour: 12, quietHoursEnabled: true }).contour).toBe("B");
    expect(resolveContour({ messageKind: "request_for_explanation", currentHour: 12, quietHoursEnabled: true }).contour).toBe("C");
    expect(resolveContour({ messageKind: "smalltalk_hangout", currentHour: 12, quietHoursEnabled: true }).contour).toBe("B");
    expect(resolveContour({ messageKind: "low_signal_noise", currentHour: 12, quietHoursEnabled: true }).contour).toBe("A");
  });
});
