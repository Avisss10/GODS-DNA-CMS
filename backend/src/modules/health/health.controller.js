function checkHealth(req, res) {
  return res.status(200).json({
    status: 'OK',
    service: 'gods-dna-cms-backend',
    timestamp: new Date().toISOString(),
  });
}

module.exports = { checkHealth };