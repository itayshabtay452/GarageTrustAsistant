# Garage Trust Assistant

A Next.js application that provides professional responses for customer car inquiries using OpenAI's API.

## Features

- Single-page form interface for customer car questions
- OpenAI-powered responses with structured suggestions
- Tailwind CSS styling
- TypeScript support

## Getting Started

### Prerequisites

- Node.js 18+ installed
- OpenAI API key

### Installation

1. Install dependencies:
   \\\ash
   npm install
   \\\

2. Create a \.env.local\ file in the root directory and add your OpenAI API key:
   \\\
   OPENAI_API_KEY=your_openai_api_key_here
   \\\

3. Run the development server:
   \\\ash
   npm run dev
   \\\

4. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Usage

1. Enter the car's make and model
2. (Optional) Enter the car's year
3. Enter the customer's question
4. Click "Generate Answer" to get:
   - A recommended response to tell the customer
   - Key points to emphasize
   - Things to avoid saying without a proper inspection

## API Route

The application uses a Next.js App Router route handler at \/api/generate\ that:

- Accepts POST requests with \carMakeModel\, \carYear\, and \customerQuestion\
- Calls OpenAI's API to generate contextual responses
- Returns JSON with the specified structure

## Environment Variables

- \OPENAI_API_KEY\: Your OpenAI API key (required)

## Technologies Used

- [Next.js](https://nextjs.org) - React framework with App Router
- [Tailwind CSS](https://tailwindcss.com) - Utility-first CSS
- [OpenAI Node.js SDK](https://github.com/openai/node-sdk) - AI API client
- TypeScript
