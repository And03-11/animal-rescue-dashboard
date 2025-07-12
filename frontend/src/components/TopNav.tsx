// --- src/components/TopNav.tsx ---
import { AppBar, Toolbar, Button, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { isAdmin, logout } from "../auth";

export default function TopNav() {
  const navigate = useNavigate();

  return (
    <AppBar position="static">
      <Toolbar>
        <Box sx={{ flexGrow: 1 }}>
          <Button color="inherit" onClick={() => navigate("/dashboard")}>
            Dashboard
          </Button>

          {isAdmin() && (
            <Button color="inherit" onClick={() => navigate("/admin/users")}>
              Usuarios
            </Button>
          )}
        </Box>

        <Button color="inherit" onClick={logout}>
          Logout
        </Button>
      </Toolbar>
    </AppBar>
  );
}
