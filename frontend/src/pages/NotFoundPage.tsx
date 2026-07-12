import { Box, Button, Paper, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import { Link, useNavigate } from 'react-router-dom';

const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <Paper elevation={0} sx={{ minHeight: 420, display: 'grid', placeItems: 'center', p: { xs: 3, sm: 6 }, textAlign: 'center' }}>
      <Box sx={{ maxWidth: 520 }}>
        <Typography variant="overline" color="primary.main">Error 404</Typography>
        <Typography variant="h2" sx={{ mt: 1, mb: 2 }}>We could not find that page</Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          The address may be outdated, or the page may have moved to another section of the workspace.
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button variant="outlined" color="inherit" startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate(-1)}>Go back</Button>
          <Button variant="contained" component={Link} to="/dashboard" startIcon={<HomeRoundedIcon />}>Open dashboard</Button>
        </Box>
      </Box>
    </Paper>
  );
};

export default NotFoundPage;
