/**
 * factories.js
 * Factory displays and center pool state management.
 * Depends on: constants.js, bag.js
 */

function createFactoriesState(numFactories) {
  return {
    factories: Array.from({ length: numFactories ?? NUM_FACTORIES }, () => []),
    center: [],
    firstPlayerInCenter: true,
  };
}

function fillFactories(factoriesState, bagState) {
  factoriesState.center = [FIRST_PLAYER_TOKEN];
  factoriesState.firstPlayerInCenter = true;
  for (let i = 0; i < factoriesState.factories.length; i++) {
    factoriesState.factories[i] = drawTiles(bagState, TILES_PER_FACTORY);
  }
}

function takeFromFactory(factoriesState, factoryIndex, color) {
  const factory  = factoriesState.factories[factoryIndex];
  const taken    = factory.filter(t => t === color);
  const leftover = factory.filter(t => t !== color);
  factoriesState.factories[factoryIndex] = [];
  factoriesState.center.push(...leftover);
  return taken;
}

function takeFromCenter(factoriesState, color) {
  const taken = factoriesState.center.filter(t => t === color);
  factoriesState.center = factoriesState.center.filter(t => t !== color);
  return taken;
}

function claimFirstPlayerToken(factoriesState) {
  const idx = factoriesState.center.indexOf(FIRST_PLAYER_TOKEN);
  if (idx === -1) return false;
  factoriesState.center.splice(idx, 1);
  factoriesState.firstPlayerInCenter = false;
  return true;
}

function isRoundOver(factoriesState) {
  const allFactoriesEmpty = factoriesState.factories.every(f => f.length === 0);
  const centerEmpty = factoriesState.center.every(t => t === FIRST_PLAYER_TOKEN);
  return allFactoriesEmpty && centerEmpty;
}

function colorsInFactory(factories, idx) {
  return [...new Set(factories[idx])].filter(c => COLORS.includes(c));
}

function colorsInCenter(center) {
  return [...new Set(center)].filter(c => COLORS.includes(c));
}

function countInFactory(factories, idx, color) {
  return factories[idx].filter(t => t === color).length;
}

function countInCenter(center, color) {
  return center.filter(t => t === color).length;
}

function cloneFactories(factoriesState) {
  return {
    factories: factoriesState.factories.map(f => [...f]),
    center:    [...factoriesState.center],
    firstPlayerInCenter: factoriesState.firstPlayerInCenter,
  };
}

function getLegalSources(factoriesState) {
  const sources = [];
  for (let i = 0; i < factoriesState.factories.length; i++) {
    for (const color of colorsInFactory(factoriesState.factories, i)) {
      sources.push({
        source: 'factory',
        factoryIndex: i,
        color,
        count: countInFactory(factoriesState.factories, i, color),
      });
    }
  }
  for (const color of colorsInCenter(factoriesState.center)) {
    sources.push({
      source: 'center',
      factoryIndex: null,
      color,
      count: countInCenter(factoriesState.center, color),
    });
  }
  return sources;
}
