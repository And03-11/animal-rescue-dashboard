import { Box, Typography, Button } from '@mui/material';
import { Link } from 'react-router-dom';

const NotFoundPage = () => (
  <Box sx={{ textAlign: 'center', mt: 10 }}>
    <Typography variant="h3" gutterBottom>404</Typography>
    <Typography variant="h6" gutterBottom>Page Not Found</Typography>
    <Button variant="contained" component={Link} to="/">
      Go to Dashboard
    </Button>
  </Box>
);

export default NotFoundPage;
