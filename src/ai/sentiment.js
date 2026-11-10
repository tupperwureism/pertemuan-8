// Pure JavaScript inference. No network calls or native dependencies.
function createSentimentClassifier(model) {
  if (model.schema_version !== 1 || ![
    'ascii_lowercase_words_unigram_bigram_sublinear_tf_l2_v1',
    'unicode_nfkd_ascii_words_unigram_bigram_sublinear_tf_l2_v1'
  ].includes(model.preprocessing)) {
    throw new Error('Unsupported sentiment model format');
  }
  const owns = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  return function classify(text) {
    if (typeof text !== 'string') throw new TypeError('text must be a string');
    const normalized = model.preprocessing.startsWith('unicode_')
      ? text.replace(/<[^>]*>/g, ' ').normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '').toLowerCase()
      : text.toLowerCase();
    const words = (normalized.match(/[a-z0-9]+/g) || [])
      .map(w => owns(model.aliases, w) ? model.aliases[w] : w);
    const grams = words.concat(words.slice(1).map((w, i) => words[i] + ' ' + w));
    const counts = new Map();
    for (const gram of grams) {
      if (owns(model.vocabulary, gram)) {
        const index = model.vocabulary[gram];
        counts.set(index, (counts.get(index) || 0) + 1);
      }
    }
    if (counts.size === 0) {
      return {label: null, status: words.length ? 'unknown_vocabulary' : 'empty_input',
        scores: null, scoreType: 'none', experimental: true};
    }
    const values = Array.from(counts, ([i, count]) =>
      [i, (1 + Math.log(count)) * model.idf[i]]);
    const norm = Math.sqrt(values.reduce((sum, pair) => sum + pair[1] ** 2, 0));
    const scores = model.weights.map((weights, c) =>
      values.reduce((score, [i, value]) => score + weights[i] * value / norm, model.bias[c]));
    const best = scores.indexOf(Math.max(...scores));
    return {label: model.labels[best], status: 'predicted',
      scores, scoreType: model.algorithm === 'LinearSVC' ? 'decision_margin' : 'log_score',
      experimental: model.status !== 'production'};
  };
}

module.exports = {createSentimentClassifier};

