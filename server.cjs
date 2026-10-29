
const express = require("express");
const path = require("node:path");

require("dotenv").config({
  path: path.join(__dirname, ".env")
});

const app = express();

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "AI Chat Hub" });
});

app.post("/api/chat", async (req, res) => {
  const key = process.env.ROUTER_API_KEY?.trim();
  const baseUrl = process.env.ROUTER_BASE_URL?.trim();
  const model = process.env.ROUTER_MODEL?.trim();

  if (!key || !baseUrl || !model) {
    return res.status(500).json({
      error: "Thiếu ROUTER_API_KEY, ROUTER_BASE_URL hoặc ROUTER_MODEL trong Environment Variables."
    });
  }

  const messages = req.body?.messages;

  if (
    !Array.isArray(messages) ||
    messages.length < 1 ||
    messages.length > 40 ||
    !messages.every(
      (m) =>
        m &&
        ["user", "assistant", "system"].includes(m.role) &&
        typeof m.content === "string" &&
        m.content.trim().length > 0 &&
        m.content.length <= 12000
    )
  ) {
    return res.status(400).json({
      error: "Danh sách messages không hợp lệ hoặc nội dung quá dài."
    });
  }

  try {
    const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false
      }),
      signal: AbortSignal.timeout(50000)
    });

    const raw = await response.text();
    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      console.error("Phản hồi không phải JSON:", response.status);
      return res.status(502).json({
        error: `9Router trả về dữ liệu không hợp lệ (HTTP ${response.status}).`
      });
    }

    if (!response.ok) {
      console.error("Lỗi từ 9Router:", response.status, data);
      return res.status(response.status).json({
        error: data?.error?.message ||
          data?.message ||
          `9Router báo lỗi HTTP ${response.status}.`
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      console.error("Phản hồi thiếu nội dung choices.message.content");
      return res.status(502).json({
        error: "9Router không trả về nội dung văn bản."
      });
    }

    return res.json({ reply });
  } catch (error) {
    console.error("Lỗi gọi 9Router:", error.message);

    return res.status(502).json({
      error: error.name === "TimeoutError"
        ? "9Router phản hồi quá lâu. Hãy thử lại."
        : "Không kết nối được endpoint 9Router. Hãy kiểm tra ROUTER_BASE_URL."
    });
  }
});

// Vercel sử dụng handler này; không tự mở cổng trên Vercel.
module.exports = app;

// Chạy trực tiếp trên máy tính khi dùng npm start.
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);

  app.listen(port, () => {
    console.log(`Website: http://localhost:${port}`);
  });
}
