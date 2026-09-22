import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Lấy mã bí mật webhook từ biến môi trường.
// Quan trọng là biến này phải được giữ bí mật và không được tiết lộ ra phía client.
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  // Đảm bảo mã bí mật đã được cấu hình.
  if (!POLAR_WEBHOOK_SECRET) {
    console.error('SERVER_ERROR: POLAR_WEBHOOK_SECRET chưa được cấu hình.');
    return NextResponse.json(
      { message: 'Lỗi máy chủ nội bộ: Mã bí mật webhook Polar chưa được cấu hình.' },
      { status: 500 }
    );
  }

  // Lấy header chữ ký webhook tùy chỉnh.
  // Tuân thủ chuẩn Svix: sử dụng 'webhook-signature'.
  const signatureHeader = req.headers.get('webhook-signature');

  if (!signatureHeader) {
    return NextResponse.json(
      { message: 'Thiếu header webhook-signature.' },
      { status: 400 }
    );
  }

  // Lấy toàn bộ nội dung body của yêu cầu dưới dạng văn bản. Điều này rất cần thiết để xác minh chữ ký.
  const rawBody = await req.text();

  try {
    // Phân tích header webhook-signature.
    // Định dạng chuỗi mã hóa payload phải theo cấu trúc nghiêm ngặt: `msg_id.timestamp.signature_value`.
    const signatureParts = signatureHeader.split('.');
    if (signatureParts.length !== 3) {
      throw new Error(
        'Định dạng header webhook-signature không hợp lệ. Mong đợi `msg_id.timestamp.signature_value`.'
      );
    }

    const msgId = signatureParts[0];
    const timestamp = signatureParts[1]; // Dấu thời gian tính bằng giây
    const expectedSignature = signatureParts[2]; // Dạng hex của HMAC-SHA256

    // Xây dựng chuỗi cần ký: `msg_id.timestamp.payload`.
    const stringToSign = `${msgId}.${timestamp}.${rawBody}`;

    // Tính toán chữ ký HMAC-SHA256 bằng mã bí mật.
    const hmac = crypto.createHmac('sha256', POLAR_WEBHOOK_SECRET);
    hmac.update(stringToSign);
    const calculatedSignature = hmac.digest('hex');

    // So sánh chữ ký đã tính toán với chữ ký mong đợi từ header.
    // Sử dụng crypto.timingSafeEqual để ngăn chặn tấn công thời gian (timing attacks).
    if (!crypto.timingSafeEqual(Buffer.from(calculatedSignature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
      throw new Error('Chữ ký webhook không khớp.');
    }

    // (Thực hành tốt) Kiểm tra dấu thời gian để chống tấn công phát lại (replay attacks).
    const eventTimestampMs = parseInt(timestamp, 10) * 1000;
    const FIVE_MINUTES_IN_MS = 5 * 60 * 1000; // Khoảng dung sai 5 phút
    const nowMs = Date.now();

    if (isNaN(eventTimestampMs) || Math.abs(nowMs - eventTimestampMs) > FIVE_MINUTES_IN_MS) {
        throw new Error('Dấu thời gian webhook nằm ngoài dung sai cho phép (có thể là tấn công phát lại).');
    }

    // Nếu xác minh thành công, phân tích raw body dưới dạng JSON để lấy payload sự kiện.
    const event = JSON.parse(rawBody);

    // --- Logic Xử lý Sự kiện Polar.sh (theo mô tả trên GitHub) ---
    // Phần này sẽ chứa các cập nhật cơ sở dữ liệu dựa trên loại sự kiện.
    switch (event.type) {
      case 'subscription.created': {
        // Mô tả GitHub: `subscription.created` → set `plan = 'pro'`, `plan_expires_at = null`
        // Ví dụ: await db.update(users).set({ plan: 'pro', planExpiresAt: null, polarCustomerId: event.data.subscription.customer_id, polarSubscriptionId: event.data.subscription.id }).where(...);
        break;
      }
      case 'subscription.updated': {
        // Mô tả GitHub: `subscription.updated` → update expiry
        // Ví dụ: const expiresAt = event.data.subscription.cancel_at ? new Date(event.data.subscription.cancel_at) : null;
        // Ví dụ: await db.update(users).set({ planExpiresAt: expiresAt }).where(...);
        break;
      }
      case 'subscription.canceled': {
        // Mô tả GitHub: `subscription.canceled` → set `plan_expires_at = cancel_at`
        // Ví dụ: const cancelAt = event.data.subscription.cancel_at ? new Date(event.data.subscription.cancel_at) : new Date();
        // Ví dụ: await db.update(users).set({ plan: 'free', planExpiresAt: cancelAt }).where(...);
        break;
      }
      // Thêm các loại sự kiện Polar khác nếu cần (ví dụ: 'subscription.tier.upgraded', 'invoice.payment_succeeded').
      default:
        // Ghi log các sự kiện không được xử lý để theo dõi hoạt động mà không làm lỗi webhook.
        console.warn(`WEBHOOK_WARN: Đã nhận loại sự kiện Polar không được xử lý: ${event.type}.`);
        break;
    }

    return NextResponse.json({ message: `Webhook Polar event (${event.type}) đã nhận và xử lý thành công.` }, { status: 200 });

  } catch (error: any) {
    // Ghi log chi tiết lỗi nội bộ nhưng cung cấp một thông báo lỗi chung cho client.
    console.error(`WEBHOOK_ERROR: Xử lý webhook Polar thất bại. Thông báo: ${error.message}, RawBody: ${rawBody}`);

    // Phân biệt giữa lỗi phía client (chữ ký xấu, định dạng xấu) và lỗi máy chủ nội bộ.
    const status = (error.message.includes('signature') || error.message.includes('header') || error.message.includes('timestamp'))
      ? 400 // Bad Request cho lỗi xác thực/chữ ký
      : 500; // Internal Server Error cho các vấn đề không mong đợi trong quá trình xử lý

    return NextResponse.json(
      { message: `Xử lý webhook thất bại: ${status === 400 ? 'Yêu cầu không hợp lệ' : 'Lỗi máy chủ nội bộ'}.` },
      { status: status }
    );
  }
}