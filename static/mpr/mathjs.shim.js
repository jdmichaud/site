window.math.shims = [{
  name: 'add',
  fun: math.add,
}, {
  name: 'sub',
  fun: math.subtract,
}, {
  name: 'mul',
  fun: math.multiply,
}, {
  name: 'div',
  fun: math.divide,
}, {
  name: 'norm',
  fun: math.norm,
}, {
  name: 'transpose',
  fun: math.transpose,
}, {
  name: 'dot',
  fun: math.dot,
}, {
  name: 'reshape',
  fun: math.reshape,
}, {
  name: 'cross',
  fun: math.cross,
}, {
  name: 'inv',
  fun: math.inv,
}, {
  name: 'normalize',
  fun: function (v) {
    const norm = math.norm(v);
    return norm === 0 ? [0, 0, 0] : math.divide(v, norm);
  }
}, {
  name: 'neg',
  fun: function (v) {
    return math.multiply(v, -1);
  }
}, {
  name: 'angle',
  fun: function (lhs, rhs) {
    return Math.acos(lhs.normalize().dot(rhs.normalize()));
  }
}];

if (numeric !== undefined) {
  [{
    name: 'eig',
    fun: numeric.eig,
  }, {
    name: 'svd',
    fun: numeric.svd,
  }].forEach(numericjsFun => window.math.shims.push(numericjsFun));
}

window.math.shims.forEach(({name, fun}) => {
  if (Array.prototype[name] === undefined) {
    Array.prototype[name] = function (arguments) {
      if (arguments !== undefined) {
        return fun(this, arguments);
      }
      return fun(this);
    }
  }
});
