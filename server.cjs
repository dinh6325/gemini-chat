const express = require("express");
const path = require("node:path");

require("dotenv").config({
  path: path.join(__dirname, ".env")
});

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/chat", async (req, res) => {
  const key = process.env.ROUTER_API_KEY?.trim();

  const model = process.env.ROUTER_MODEL
    ?.trim()
    .replace(/^(?:gemini\/|models\/)/, "");

  if (!key || !model) {
    return res.status(500).json({
      error: "Thiếu ROUTER_API_KEY hoặc ROUTER_MODEL trong file .env."
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
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string" &&
        m.content.trim().length > 0 &&
        m.content.length <= 12000
    )
  ) {
    return res.status(400).json({
      error: "Tin nhắn không hợp lệ hoặc quá dài."
    });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          messages: messages.map(({ role, content }) => ({
            role,
            content
          })),
          stream: false
        }),
        signal: AbortSignal.timeout(50000)
      }
    );

    const raw = await response.text();
    console.log("HTTP Google:", response.status);
  console.log("Phản hồi Google:", raw);

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Google trả về dữ liệu không hợp lệ (HTTP ${response.status}).`
      );
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          response.status === 429
            ? "Đã vượt giới hạn yêu cầu hoặc quota Gemini. Kiểm tra hạn mức trong Google AI Studio."
            : data?.error?.message ||
              `Google báo lỗi HTTP ${response.status}.`
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("Gemini chưa trả về nội dung văn bản.");
    }

    return res.json({ reply });
  } catch (error) {
    console.error("Lỗi gọi Gemini:", error.message);

    return res.status(502).json({
      error:
        error.name === "TimeoutError"
          ? "Gemini phản hồi quá lâu. Bạn thử lại nhé."
          : error.message === "fetch failed"
            ? "Không kết nối được API Google Gemini. Kiểm tra Internet."
            : error.message
    });
  }
});

// Trả lỗi JSON để giao diện có thể hiển thị.
app.use((error, req, res, next) => {
if (error.type === "entity.too.large") {
    return res.status(413).json({
      error: "Dữ liệu gửi lên vượt quá 100 KB."
    });
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Dữ liệu JSON không hợp lệ."
    });
  }

  console.error(error);

  return res.status(500).json({
    error: "Máy chủ gặp lỗi."
  });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Website: http://127.0.0.1:${port}`);
  console.log("Nhấn Ctrl + C để dừng.");
});

server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Cổng ${port} đang được sử dụng. Đổi PORT trong file .env.`
      : error.message
  );

  process.exit(1);
});