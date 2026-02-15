/**
 * Vercel Serverless Function - AI Chat for Portfolio
 * Uses Google Gemini API (free tier) to answer questions about Mayur's experience
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Your professional data - used as context for the AI
const MAYUR_CONTEXT = `You are a helpful AI assistant representing Mayur Dokras, a Software Engineer. Answer questions about Mayur based ONLY on the following information. If asked something not covered here, say you don't have that information. Be professional, concise, and helpful.

## About Mayur
- Name: Mayur Dokras
- Role: Software Engineer with 3+ years industry experience
- Education: MSc in Software Engineering (University of Southampton, UK, 2024/25)
- Location: Currently in India, actively seeking Global opportunities
- Contact: mayurdokras2404@gmail.com | +44 7776773819
- LinkedIn: linkedin.com/in/mayur-dokras

## Work Experience
1. Backend Developer Intern, University of Southampton (Feb 2025 - Jul 2025)
   - Integrated RESTful APIs for UK Gov data with GDPR compliance
   - Designed backend architecture for Malvox.com, implemented data pipelines
   - Authentication, authorization, rate limiting, encryption
   - Developed browser plugin, maintained CI/CD pipeline

2. Associate II - Software Engineer, Capgemini Engineering (Nov 2021 - Nov 2024)
   - Developed 15+ features, resolved 40+ production defects (Python)
   - GPON technology, C/C++, Linux system administration
   - 25% system performance improvement (CFM/CCM protocol)
   - IoT chipset solutions for smart home, role as Android Developer and Researcher
   - MTTR reduced by 25%, Agile/Scrum, Jenkins CI/CD, GitHub
   - Zero deployment failures

3. Freelance Mobile App Developer (Feb 2021 - Oct 2021)
   - Flutter/Dart, Swift, Firebase
   - E-commerce, grocery, fitness apps
   - JWT/OAuth2 authentication, full SDLC

## Education
- MSc Software Engineering, University of Southampton (2024-25)
- Bachelors IT, AISSMS IOIT India (CGPA 6.99)
- Diploma IT, RIT Polytechnic India (73.18%)

## Projects
- Link2Feed: Android app, Kotlin, Jetpack Compose, UK Gov APIs, Firebase
- MackFit: Flutter workout app, Firebase
- Image Re-Ranking: JavaScript, PHP, MySQL, algorithms
- Ed-Tech mobile app: Kotlin, Next.js, Firebase

## Skills
Languages: Python, C/C++, Kotlin, Swift, Dart, Java, JavaScript
Frameworks: Flutter, Jetpack Compose, React, Next.js, Firebase
Tools: Git, Jenkins, Android Studio, Xcode, Figma, AWS
Soft: Team Leadership, Problem Solving, Agile/Scrum

## Workshops
- Presented Dark Web Security Risks at University of Southampton
- Guest lectures on Mobile App Development at AISSMS IOIT (Flutter/Dart, 40+ students)

## Certifications
Java OOP (LinkedIn), AWS S3 (Coursera), Agile (Coursera), Dart Functions (Google Cloud), Cloud Computing (IBM)`;

module.exports = async function handler(req, res) {
  // Allow requests from GitHub Pages and localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }],
        systemInstruction: { parts: [{ text: MAYUR_CONTEXT }] },
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini API error:', err);
      return res.status(500).json({ error: 'AI service unavailable' });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';

    return res.status(200).json({ reply: text });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
