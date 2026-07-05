describe('Dependency Installation Check', () => {
  it('express harus terinstall dan berupa function', () => {
    const express = require('express');
    expect(typeof express).toBe('function');
  });

  it('dotenv harus terinstall dan punya method config', () => {
    const dotenv = require('dotenv');
    expect(typeof dotenv.config).toBe('function');
  });

  it('mysql2 (promise) harus terinstall dan punya createConnection', () => {
    const mysql = require('mysql2/promise');
    expect(typeof mysql.createConnection).toBe('function');
  });

  it('jsonwebtoken harus terinstall dan punya sign & verify', () => {
    const jwt = require('jsonwebtoken');
    expect(typeof jwt.sign).toBe('function');
    expect(typeof jwt.verify).toBe('function');
  });

  it('bcrypt harus terinstall dan punya hash & compare', () => {
    const bcrypt = require('bcrypt');
    expect(typeof bcrypt.hash).toBe('function');
    expect(typeof bcrypt.compare).toBe('function');
  });

  it('cookie-parser harus terinstall dan berupa function', () => {
    const cookieParser = require('cookie-parser');
    expect(typeof cookieParser).toBe('function');
  });

  it('ioredis harus terinstall dan berupa constructor function', () => {
    const Redis = require('ioredis');
    expect(typeof Redis).toBe('function');
  });

  it('cors harus terinstall dan berupa function', () => {
    const cors = require('cors');
    expect(typeof cors).toBe('function');
  });

  it('express-validator harus terinstall dan punya body() & validationResult()', () => {
    const { body, validationResult } = require('express-validator');
    expect(typeof body).toBe('function');
    expect(typeof validationResult).toBe('function');
  });

  it('supertest harus terinstall dan berupa function', () => {
    const request = require('supertest');
    expect(typeof request).toBe('function');
  });
});