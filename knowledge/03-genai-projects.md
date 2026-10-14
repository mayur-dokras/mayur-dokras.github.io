---
title: GenAI Projects
questions:
  - What is Mayur's experience with LLMs and GenAI?
  - Tell me about SotonBuddy
  - Has Mayur fine-tuned a model?
---

## Small Language Model with voice (founder project, in stealth)
Mayur is building his own product: a small language model (SLM) with voice integration, for his own website and an Android application, running on free and open-source infrastructure. It has not launched yet and work is ongoing. The domain and training data are confidential until launch, so MACK cannot share details about what it is trained on.

## SotonBuddy: LoRA fine-tuned campus assistant
SotonBuddy is a University of Southampton campus chatbot that Mayur built with classmates. It gives students walking directions to campus buildings and answers university questions. The model was fine-tuned with LoRA (low-rank adaptation) on question-and-answer pairs created from University of Southampton website documents, using Hugging Face and PyTorch. It was built as an MSc coursework project and trialled with a test batch on a free student workspace, where 68 of the 83 students in his MSc class tried it. It is not a public product.

## AI Engineering Platform (in progress)
An AI-powered platform for intelligent assistants, LLM integration and workflow automation. Backend services are built with Python and FastAPI, using retrieval-augmented generation (RAG) over a Chroma vector store, OpenAI APIs and secure REST APIs, designed for production-ready AI applications and agentic workflows.

## MACK: AI career assistant (this chatbot)
MACK is the assistant on Mayur's portfolio. It uses Google Gemini 2.5 Flash behind a Vercel serverless API, with hybrid retrieval (vector embeddings plus BM25 keyword search) over a knowledge base. A GitHub Actions pipeline rebuilds the knowledge base and embeddings whenever the knowledge files change and every week, pulls in Mayur's public GitHub repositories, and runs an automated evaluation suite that fails the build if answer quality regresses. MACK streams answers token by token, cites its sources, keeps multi-turn context, supports voice input, and can score a pasted job description against Mayur's profile.

## Job Octo: job matching board
Job Octo is Mayur's job board, still in development and not launched yet. It auto-fetches roles matching a profile, shows a skills-match percentage on every job card, and tracks applications from Applied to Accepted or Rejected. He plans to open it to friends and launch it publicly with worldwide coverage of FinTechs and MNCs.

## LLM deployment and MLOps practice
Mayur follows CI/CD practices for deploying LLM applications: versioned knowledge and prompts, automated evaluation before release, and continuous improvement of answers through retrieval context and prompt engineering. He has experience with Docker, Kubernetes, GitHub Actions and Jenkins pipelines.
