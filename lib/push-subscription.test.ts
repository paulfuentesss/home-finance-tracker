import { describe, expect, it } from "vitest";
import { isPushEndpoint, parseEndpoint, parseSubscription } from "./push-subscription";

describe("isPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:APA91b",
    "https://web.push.apple.com/QGuQyavXutnMH",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
  ])("accepts the browsers' push services: %s", (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc", // not https
    "https://fcm.googleapis.com:8443/fcm/send/abc", // another port
    "https://evil.example.com/fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.example.com/x",
    "https://notapush.apple.com.example/x",
    "https://localhost/x",
    "https://169.254.169.254/latest",
    "not a url",
    "",
  ])("refuses anything else: %s", (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(false);
  });
});

describe("parseSubscription", () => {
  const good = {
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc:APA91b",
      expirationTime: null,
      keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
    },
    platform: "android",
  };

  it("keeps the endpoint, keys and device type", () => {
    expect(parseSubscription(good)).toEqual({
      endpoint: good.subscription.endpoint,
      p256dh: good.subscription.keys.p256dh,
      auth: good.subscription.keys.auth,
      platform: "android",
    });
  });

  it("refuses an unknown push service, missing or odd keys, or an unknown device type", () => {
    const sub = good.subscription;
    expect(parseSubscription(null)).toBeNull();
    expect(parseSubscription({ ...good, subscription: { ...sub, endpoint: "https://example.com/push" } })).toBeNull();
    expect(parseSubscription({ ...good, subscription: { ...sub, keys: undefined } })).toBeNull();
    expect(parseSubscription({ ...good, subscription: { ...sub, keys: { ...sub.keys, auth: "not base64!" } } })).toBeNull();
    expect(parseSubscription({ ...good, subscription: { ...sub, keys: { ...sub.keys, p256dh: "A".repeat(500) } } })).toBeNull();
    expect(parseSubscription({ ...good, platform: "toaster" })).toBeNull();
  });
});

it("parseEndpoint takes only a push service's address", () => {
  expect(parseEndpoint({ endpoint: "https://web.push.apple.com/QGuQ" })).toBe("https://web.push.apple.com/QGuQ");
  expect(parseEndpoint({ endpoint: "https://example.com/x" })).toBeNull();
  expect(parseEndpoint({})).toBeNull();
});
