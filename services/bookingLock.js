// Simple in-memory locking mechanism to prevent race conditions
class BookingLock {
  constructor() {
    this.locks = new Map(); // Map of "date-time" -> timestamp
    this.lockTimeout = 5000; // 5 seconds
  }

  generateLockKey(date, time) {
    return `${date}-${time}`;
  }

  async acquireLock(date, time) {
    const lockKey = this.generateLockKey(date, time);
    const now = Date.now();
    
    // Check if lock exists and is still valid
    if (this.locks.has(lockKey)) {
      const lockTime = this.locks.get(lockKey);
      if (now - lockTime < this.lockTimeout) {
        return false; // Lock is active, cannot acquire
      } else {
        // Lock expired, remove it
        this.locks.delete(lockKey);
      }
    }
    
    // Acquire lock
    this.locks.set(lockKey, now);
    console.log(`🔒 Lock acquired for ${lockKey}`);
    return true;
  }

  releaseLock(date, time) {
    const lockKey = this.generateLockKey(date, time);
    this.locks.delete(lockKey);
    console.log(`🔓 Lock released for ${lockKey}`);
  }

  // Clean up expired locks periodically
  cleanupExpiredLocks() {
    const now = Date.now();
    for (const [key, timestamp] of this.locks.entries()) {
      if (now - timestamp > this.lockTimeout) {
        this.locks.delete(key);
        console.log(`🧹 Expired lock cleaned up: ${key}`);
      }
    }
  }
}

// Singleton instance
const bookingLock = new BookingLock();

// Cleanup expired locks every 30 seconds
setInterval(async () => {
  await bookingLock.cleanupExpiredLocks();
}, 30000);

module.exports = bookingLock;