import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Divider,
  Alert,
  CircularProgress
} from '@mui/material';
import { 
  CalendarMonth, 
  Restaurant, 
  Print,
  Close,
  LocalDining,
  Spa
} from '@mui/icons-material';

const MenuDisplay = () => {
  const [weeklyMenu, setWeeklyMenu] = useState(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);

  const days = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday'];
  
  useEffect(() => {
    // Get current day of week
    const today = new Date().getDay();
    const dayMapping = { 0: 6, 1: 5, 2: 6, 3: 0, 4: 1, 5: 2, 6: 3 }; // Map JS days to menu days
    setSelectedDay(dayMapping[today] || 0);
    
    fetchWeeklyMenu();
  }, []);

  const fetchWeeklyMenu = async () => {
    try {
      setLoading(true);
      // First try to fetch from API
      const response = await fetch('/api/menu/weekly/1');
      if (response.ok) {
        const data = await response.json();
        setWeeklyMenu(data);
      } else {
        // Fallback to JSON file
        const jsonResponse = await fetch('/backend/data/menus/tsmc-camp-week1-menu.json');
        const jsonData = await jsonResponse.json();
        setWeeklyMenu(jsonData);
      }
    } catch (err) {
      setError('Failed to load menu data');
      console.error(err);
      // Try to load the JSON file directly
      try {
        const menuData = require('../../../backend/data/menus/tsmc-camp-week1-menu.json');
        setWeeklyMenu(menuData);
        setError(null);
      } catch (e) {
        console.error('Failed to load menu from all sources');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDayChange = (event, newValue) => {
    setSelectedDay(newValue);
  };

  const getCategoryColor = (category) => {
    const colors = {
      'Main': 'primary',
      'Side': 'secondary',
      'Healthy Option': 'success',
      'South Asian Cuisine': 'warning',
      'Salad': 'info'
    };
    return colors[category] || 'default';
  };

  const formatMenuItem = (item) => {
    if (typeof item === 'string') return item;
    return item.name || item;
  };

  const PrintableMenu = () => (
    <Box p={4}>
      <Typography variant="h3" align="center" gutterBottom>
        {weeklyMenu?.location || 'TSMC CAMP'} - Week {weeklyMenu?.weekNumber || 1}
      </Typography>
      <Typography variant="h5" align="center" gutterBottom>
        {weeklyMenu?.mealType || 'SUPPER'} MENU
      </Typography>
      
      <Grid container spacing={2} mt={2}>
        {days.map((day) => {
          const dayData = weeklyMenu?.days?.[day];
          if (!dayData) return null;
          
          return (
            <Grid item xs={12} md={6} lg={4} key={day}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" color="primary" gutterBottom>
                    {day}
                  </Typography>
                  
                  {dayData.mainDishes && (
                    <>
                      <Typography variant="subtitle2" color="textSecondary">Main Dishes</Typography>
                      {dayData.mainDishes.map((dish, idx) => (
                        <Typography key={idx} variant="body2">• {dish}</Typography>
                      ))}
                    </>
                  )}
                  
                  {dayData.sides && (
                    <>
                      <Typography variant="subtitle2" color="textSecondary" mt={1}>Sides</Typography>
                      {dayData.sides.map((side, idx) => (
                        <Typography key={idx} variant="body2">• {side}</Typography>
                      ))}
                    </>
                  )}
                  
                  {dayData.salad && (
                    <>
                      <Typography variant="subtitle2" color="textSecondary" mt={1}>Salad</Typography>
                      <Typography variant="body2">• {dayData.salad}</Typography>
                    </>
                  )}
                  
                  {dayData.healthyOption && (
                    <>
                      <Typography variant="subtitle2" color="textSecondary" mt={1}>Healthy Option</Typography>
                      <Typography variant="body2">• {dayData.healthyOption}</Typography>
                    </>
                  )}
                  
                  {dayData.southAsianCuisine && (
                    <>
                      <Typography variant="subtitle2" color="textSecondary" mt={1}>South Asian Cuisine</Typography>
                      <Typography variant="body2">• {dayData.southAsianCuisine.main}</Typography>
                      <Typography variant="body2">• {dayData.southAsianCuisine.vegetarian}</Typography>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error && !weeklyMenu) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  const currentDayData = weeklyMenu?.days?.[days[selectedDay]];

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <CalendarMonth fontSize="large" color="primary" />
          <Typography variant="h4">
            {weeklyMenu?.location || 'TSMC CAMP'} Menu - Week {weeklyMenu?.weekNumber || 1}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Print />}
          onClick={() => setPrintDialogOpen(true)}
        >
          Print Menu
        </Button>
      </Box>

      <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={selectedDay} onChange={handleDayChange} variant="scrollable" scrollButtons="auto">
          {days.map((day, index) => (
            <Tab key={day} label={day} />
          ))}
        </Tabs>
      </Paper>

      <Grid container spacing={3} mt={1}>
        {/* Main Dishes */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <Restaurant color="primary" />
                <Typography variant="h6">Main Dishes</Typography>
              </Box>
              {currentDayData?.mainDishes?.map((dish, idx) => (
                <Chip
                  key={idx}
                  label={formatMenuItem(dish)}
                  sx={{ m: 0.5 }}
                  size="medium"
                />
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Sides */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Sides & Accompaniments</Typography>
              {currentDayData?.sides?.map((side, idx) => (
                <Chip
                  key={idx}
                  label={formatMenuItem(side)}
                  color="secondary"
                  sx={{ m: 0.5 }}
                  size="medium"
                />
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Healthy Option & Salad */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <Spa color="success" />
                <Typography variant="h6">Healthy Options</Typography>
              </Box>
              {currentDayData?.healthyOption && (
                <Chip
                  label={`Healthy: ${currentDayData.healthyOption}`}
                  color="success"
                  sx={{ m: 0.5 }}
                />
              )}
              {currentDayData?.salad && (
                <Chip
                  label={`Salad: ${currentDayData.salad}`}
                  color="info"
                  sx={{ m: 0.5 }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* South Asian Cuisine */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <LocalDining color="warning" />
                <Typography variant="h6">South Asian Cuisine</Typography>
              </Box>
              {currentDayData?.southAsianCuisine && (
                <Box>
                  <Chip
                    label={currentDayData.southAsianCuisine.main}
                    color="warning"
                    sx={{ m: 0.5 }}
                  />
                  <Chip
                    label={currentDayData.southAsianCuisine.vegetarian}
                    color="warning"
                    variant="outlined"
                    sx={{ m: 0.5 }}
                  />
                  {currentDayData.southAsianCuisine.side && (
                    <Chip
                      label={currentDayData.southAsianCuisine.side}
                      sx={{ m: 0.5 }}
                      size="small"
                    />
                  )}
                  <Chip
                    label={currentDayData.southAsianCuisine.rice}
                    sx={{ m: 0.5 }}
                    size="small"
                  />
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Full Week Overview */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Week at a Glance</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Day</TableCell>
                      <TableCell>Main Dishes</TableCell>
                      <TableCell>Healthy Option</TableCell>
                      <TableCell>South Asian</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {days.map((day) => {
                      const dayData = weeklyMenu?.days?.[day];
                      return (
                        <TableRow key={day}>
                          <TableCell><strong>{day}</strong></TableCell>
                          <TableCell>{dayData?.mainDishes?.join(', ')}</TableCell>
                          <TableCell>{dayData?.healthyOption}</TableCell>
                          <TableCell>{dayData?.southAsianCuisine?.main}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Print Dialog */}
      <Dialog
        open={printDialogOpen}
        onClose={() => setPrintDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Print Menu</Typography>
            <IconButton onClick={() => setPrintDialogOpen(false)}>
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box id="printable-menu">
            <PrintableMenu />
          </Box>
          <Box mt={2} display="flex" justifyContent="center">
            <Button
              variant="contained"
              startIcon={<Print />}
              onClick={() => {
                window.print();
              }}
            >
              Print Now
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default MenuDisplay;