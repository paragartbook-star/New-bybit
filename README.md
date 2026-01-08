# TradingView to Bybit Automated Trading Bot

Cloudflare Worker for automated trading using TradingView webhooks and Bybit API.

## Features

- ✅ Real-time TradingView alert processing
- ✅ Automatic order placement on Bybit
- ✅ Stop Loss & Take Profit support
- ✅ Secure API key handling
- ✅ Auto-deployment via GitHub Actions

## Setup Instructions

### 1. GitHub Secrets Required

Add these secrets in **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

### 2. Cloudflare Environment Variables

Add in **Workers Dashboard → Settings → Variables**:

- `BYBIT_API_KEY` - Your Bybit API key
- `BYBIT_SECRET` - Your Bybit secret key

### 3. Deploy

Push to `main` branch to auto-deploy via GitHub Actions.

## Usage

Set TradingView webhook URL to:
