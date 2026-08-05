module.exports = async function handler(req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(
    JSON.stringify({
      ok: true,
      service: "naver-keyword-gpt-action",
      configured: Boolean(
        process.env.NAVER_API_KEY &&
          process.env.NAVER_SECRET_KEY &&
          process.env.NAVER_CUSTOMER_ID &&
          process.env.ACTION_API_KEY
      ),
      time: new Date().toISOString(),
    })
  );
};
