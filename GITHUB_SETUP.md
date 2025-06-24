# GitHub Setup Commands

After creating your GitHub repository, run these commands:

```bash
cd /Users/davidmikulis/neuro-pilot-ai

# Add GitHub as remote
git remote add origin https://github.com/YOUR_USERNAME/neuro-pilot-ai.git

# Push your code
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

If you get an authentication error, you may need to:
1. Use a personal access token instead of password
2. Or use GitHub Desktop app
3. Or use SSH keys

## Next: Deploy to Railway

Once your code is on GitHub:
1. Go to railway.app
2. Sign up with GitHub
3. Click "Deploy from GitHub repo"
4. Select neuro-pilot-ai
5. Add environment variables
6. Your business goes live 24/7!