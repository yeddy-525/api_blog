const crypto = require("crypto");

const NAVER_BASE_URL = "https://api.searchad.naver.com";
const NAVER_PATH = "/keywordstool";
const MAX_SEEDS = 5;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeKeyword(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

function parseCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { raw: value, value, isRange: false };
  }

  const raw = String(value ?? "").trim();
  const lessThanMatch = raw.match(/^<\s*(\d+(?:\.\d+)?)$/);

  if (lessThanMatch) {
    const upperBound = Number(lessThanMatch[1]);
    return {
      raw,
      value: Number.isFinite(upperBound) ? upperBound / 2 : 0,
      isRange: true,
    };
  }

  const parsed = Number(raw.replace(/,/g, ""));
  return {
    raw,
    value: Number.isFinite(parsed) ? parsed : 0,
    isRange: false,
  };
}

function normalizeItem(item) {
  const pc = parseCount(item.monthlyPcQcCnt);
  const mobile = parseCount(item.monthlyMobileQcCnt);

  return {
    keyword: item.relKeyword,
    monthlyPcSearchRaw: pc.raw,
    monthlyMobileSearchRaw: mobile.raw,
    monthlyPcSearchApprox: pc.value,
    monthlyMobileSearchApprox: mobile.value,
    monthlyTotalSearchApprox: pc.value + mobile.value,
    containsRangeValue: pc.isRange || mobile.isRange,
    monthlyAveragePcClicks: item.monthlyAvePcClkCnt ?? null,
    monthlyAverageMobileClicks: item.monthlyAveMobileClkCnt ?? null,
    monthlyAveragePcCtr: item.monthlyAvePcCtr ?? null,
    monthlyAverageMobileCtr: item.monthlyAveMobileCtr ?? null,
    averageAdDepth: item.plAvgDepth ?? null,
    advertisingCompetition: item.compIdx ?? null,
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Allow", "POST, OPTIONS");
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, {
      error: "method_not_allowed",
      message: "POST 요청만 지원합니다.",
    });
  }

  const requiredEnv = [
    "NAVER_API_KEY",
    "NAVER_SECRET_KEY",
    "NAVER_CUSTOMER_ID",
    "ACTION_API_KEY",
  ];
  const missingEnv = requiredEnv.filter((name) => !process.env[name]);

  if (missingEnv.length > 0) {
    return sendJson(res, 500, {
      error: "server_not_configured",
      message: `서버 환경변수가 누락되었습니다: ${missingEnv.join(", ")}`,
    });
  }

  const providedActionKey = req.headers["x-action-key"];
  if (!safeEqual(providedActionKey, process.env.ACTION_API_KEY)) {
    return sendJson(res, 401, {
      error: "unauthorized",
      message: "Action 인증 키가 올바르지 않습니다.",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return sendJson(res, 400, {
        error: "invalid_json",
        message: "요청 본문이 올바른 JSON이 아닙니다.",
      });
    }
  }

  const rawSeeds = Array.isArray(body?.seeds) ? body.seeds : [];
  const seeds = [...new Set(rawSeeds.map(normalizeKeyword).filter(Boolean))];

  if (seeds.length < 1 || seeds.length > MAX_SEEDS) {
    return sendJson(res, 400, {
      error: "invalid_seeds",
      message: `seeds는 1개 이상 ${MAX_SEEDS}개 이하로 보내야 합니다.`,
    });
  }

  if (seeds.some((seed) => seed.length > 50)) {
    return sendJson(res, 400, {
      error: "seed_too_long",
      message: "각 키워드는 공백 제외 50자 이하여야 합니다.",
    });
  }

  const requestedLimit = Number(body?.limit ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const timestamp = Date.now().toString();
  const signatureMessage = `${timestamp}.GET.${NAVER_PATH}`;
  const signature = crypto
    .createHmac("sha256", process.env.NAVER_SECRET_KEY)
    .update(signatureMessage)
    .digest("base64");

  const params = new URLSearchParams({
    hintKeywords: seeds.join(","),
    showDetail: "1",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const upstream = await fetch(
      `${NAVER_BASE_URL}${NAVER_PATH}?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "X-Timestamp": timestamp,
          "X-API-KEY": process.env.NAVER_API_KEY,
          "X-Customer": process.env.NAVER_CUSTOMER_ID,
          "X-Signature": signature,
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 500) };
    }

    if (!upstream.ok) {
      return sendJson(res, upstream.status, {
        error: "naver_api_error",
        message: "네이버 검색광고 API 호출에 실패했습니다.",
        upstreamStatus: upstream.status,
        upstream: data,
      });
    }

    const keywordList = Array.isArray(data?.keywordList)
      ? data.keywordList.map(normalizeItem)
      : [];

    const seedSet = new Set(seeds);
    const exactMatches = keywordList.filter((item) =>
      seedSet.has(normalizeKeyword(item.keyword))
    );

    const relatedKeywords = keywordList
      .filter((item) => !seedSet.has(normalizeKeyword(item.keyword)))
      .sort(
        (a, b) =>
          b.monthlyTotalSearchApprox - a.monthlyTotalSearchApprox
      )
      .slice(0, limit);

    return sendJson(res, 200, {
      source: "NAVER SearchAd GET /keywordstool",
      generatedAt: new Date().toISOString(),
      seeds,
      interpretationNotes: [
        "monthlyPcSearchRaw와 monthlyMobileSearchRaw가 '< 10' 형태이면 정확한 수치가 아닙니다.",
        "Approx 값은 '< 10'을 정렬 편의를 위해 5로 환산한 값이며 실제 검색량으로 단정하면 안 됩니다.",
        "advertisingCompetition은 검색광고 경쟁도이며 네이버 블로그 상위노출 경쟁도를 뜻하지 않습니다.",
      ],
      exactMatches,
      relatedKeywords,
    });
  } catch (error) {
    const isTimeout = error?.name === "AbortError";
    return sendJson(res, isTimeout ? 504 : 500, {
      error: isTimeout ? "naver_api_timeout" : "internal_error",
      message: isTimeout
        ? "네이버 검색광고 API 응답 시간이 초과되었습니다."
        : "키워드 조회 중 오류가 발생했습니다.",
    });
  } finally {
    clearTimeout(timeout);
  }
};
