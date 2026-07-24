exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store'
    },
    body: `window.__FB_API_KEY__ = "${process.env.FIREBASE_API_KEY}";`
  };
};
