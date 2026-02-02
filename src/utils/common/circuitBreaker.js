/**
 * Circuit Breaker Utility
 * Protects against cascading failures from external API calls
 * @module utils/common/circuitBreaker
 */

const logger = require('../../core/Logger');

/**
 * Circuit breaker states
 */
const CircuitState = {
    CLOSED: 'closed',     // Normal operation
    OPEN: 'open',         // Failing, reject all requests
    HALF_OPEN: 'half_open' // Testing if service recovered
};

/**
 * Default circuit breaker options
 */
const DEFAULT_OPTIONS = {
    failureThreshold: 5,    // Failures before opening circuit
    successThreshold: 2,    // Successes in half-open before closing
    timeout: 30000,         // Time to wait before half-open (ms)
    resetTimeout: 60000     // Time to keep circuit open before trying (ms)
};

/**
 * Circuit breaker instances per service
 */
const circuits = new Map();

/**
 * Get or create circuit for a service
 * @param {string} name - Service name
 * @param {Object} options - Circuit options
 * @returns {Object} Circuit instance
 */
function getCircuit(name, options = {}) {
    if (!circuits.has(name)) {
        circuits.set(name, {
            state: CircuitState.CLOSED,
            failureCount: 0,
            successCount: 0,
            lastFailureTime: null,
            options: { ...DEFAULT_OPTIONS, ...options }
        });
    }
    return circuits.get(name);
}

/**
 * Check if circuit allows requests
 * @param {string} name - Service name
 * @returns {boolean}
 */
function isCircuitClosed(name) {
    const circuit = getCircuit(name);
    
    if (circuit.state === CircuitState.CLOSED) {
        return true;
    }
    
    if (circuit.state === CircuitState.OPEN) {
        // Check if we should try half-open
        const timeSinceFailure = Date.now() - circuit.lastFailureTime;
        if (timeSinceFailure >= circuit.options.resetTimeout) {
            circuit.state = CircuitState.HALF_OPEN;
            circuit.successCount = 0;
            logger.debug('CircuitBreaker', `${name}: Entering half-open state`);
            return true;
        }
        return false;
    }
    
    // Half-open: allow limited requests
    return true;
}

/**
 * Record a successful call
 * @param {string} name - Service name
 */
function recordSuccess(name) {
    const circuit = getCircuit(name);
    
    if (circuit.state === CircuitState.HALF_OPEN) {
        circuit.successCount++;
        if (circuit.successCount >= circuit.options.successThreshold) {
            circuit.state = CircuitState.CLOSED;
            circuit.failureCount = 0;
            logger.info('CircuitBreaker', `${name}: Circuit closed (recovered)`);
        }
    } else if (circuit.state === CircuitState.CLOSED) {
        // Reset failure count on success
        circuit.failureCount = 0;
    }
}

/**
 * Record a failed call
 * @param {string} name - Service name
 */
function recordFailure(name) {
    const circuit = getCircuit(name);
    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();
    
    if (circuit.state === CircuitState.HALF_OPEN) {
        // Failed during half-open, re-open circuit
        circuit.state = CircuitState.OPEN;
        logger.warn('CircuitBreaker', `${name}: Circuit re-opened (failed during recovery)`);
    } else if (circuit.state === CircuitState.CLOSED) {
        if (circuit.failureCount >= circuit.options.failureThreshold) {
            circuit.state = CircuitState.OPEN;
            logger.warn('CircuitBreaker', `${name}: Circuit opened (${circuit.failureCount} failures)`);
        }
    }
}

/**
 * Execute function with circuit breaker protection
 * @param {string} name - Service name
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Circuit options
 * @returns {Promise<any>}
 */
async function withCircuitBreaker(name, fn, options = {}) {
    const circuit = getCircuit(name, options);
    
    if (!isCircuitClosed(name)) {
        const error = new Error(`Circuit breaker open for ${name}`);
        error.code = 'CIRCUIT_OPEN';
        throw error;
    }
    
    try {
        const result = await fn();
        recordSuccess(name);
        return result;
    } catch (error) {
        recordFailure(name);
        throw error;
    }
}

/**
 * Get circuit status
 * @param {string} name - Service name
 * @returns {Object}
 */
function getCircuitStatus(name) {
    const circuit = getCircuit(name);
    return {
        name,
        state: circuit.state,
        failureCount: circuit.failureCount,
        successCount: circuit.successCount,
        lastFailureTime: circuit.lastFailureTime
    };
}

/**
 * Reset circuit to closed state
 * @param {string} name - Service name
 */
function resetCircuit(name) {
    const circuit = getCircuit(name);
    circuit.state = CircuitState.CLOSED;
    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.lastFailureTime = null;
    logger.info('CircuitBreaker', `${name}: Circuit manually reset`);
}

module.exports = {
    CircuitState,
    withCircuitBreaker,
    recordSuccess,
    recordFailure,
    getCircuitStatus,
    resetCircuit,
    isCircuitClosed
};
