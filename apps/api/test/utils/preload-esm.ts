// @nestjs/throttler is CommonJS and require()s the ESM-only @nestjs/common and
// @nestjs/core. Jest's ESM runtime rejects that when those packages are not yet
// evaluated ("require(esm) in a cycle"), so evaluate them first.
import '@nestjs/common';
import '@nestjs/core';
