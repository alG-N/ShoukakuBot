/**
 * Core Resilience Category
 * @module core/resilience
 */

export * from './CircuitBreaker.js';

export {
    circuitBreakerRegistry,
    CircuitBreakerRegistry,
    CIRCUIT_CONFIGS
} from './CircuitBreakerRegistry.js';
export { type RegistryHealth, type RegistrySummary, type FallbackResult } from './CircuitBreakerRegistry.js';

export {
    default as gracefulDegradation,
    gracefulDegradation as gracefulDegradationInstance,
    GracefulDegradation,
    DegradationLevel,
    ServiceState
} from './GracefulDegradation.js';