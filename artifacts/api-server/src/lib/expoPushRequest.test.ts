import { test } from "node:test";
import assert from "node:assert/strict";
import { sendExpoPushRequest } from "./expoPushRequest.ts";

test("Expo request aborts when its provider timeout expires", async () => {
  let requestSignal: AbortSignal | undefined;
  const request = sendExpoPushRequest(
    { to: "ExponentPushToken[test]" },
    {
      timeoutMs: 10,
      fetchImpl: async (_input, init) => {
        requestSignal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>((_resolve, reject) => {
          const signal = requestSignal;
          if (!signal) {
            reject(new Error("request signal was not provided"));
            return;
          }
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    },
  );

  await assert.rejects(request, { name: "TimeoutError" });
  assert.equal(requestSignal?.aborted, true);
});
