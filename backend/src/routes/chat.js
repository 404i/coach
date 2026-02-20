import express from 'express';
import { chatWithCoach } from '../services/llm-coach.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { profile_id, message, history } = req.body;
    
    if (!profile_id || !message) {
      return res.status(400).json({ error: 'profile_id and message required' });
    }
    
    const response = await chatWithCoach(
      profile_id,
      history || [],
      message
    );
    
    res.json({
      success: true,
      response
    });
  } catch (error) {
    res.status(500).json({
      error: 'Chat failed',
      message: error.message
    });
  }
});

export default router;
