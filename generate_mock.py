import json
import random
import copy

# Cargar el JSON real
with open('data.json', 'r', encoding='utf-8') as f:
    real_data = json.load(f)

# Configuración del mock
MOCK_TEAMS = 10          # Número de equipos a conservar
MOCK_PLAYERS = 50        # Número de jugadores a conservar
FAKE_NAMES = True        # ¿Reemplazar nombres reales por nombres falsos?

# Lista de nombres falsos (puedes ampliarla o generarlos automáticamente)
fake_first_names = ["Juan", "Carlos", "Luis", "Pedro", "José", "Miguel", "Javier", "Rafael", "Antonio", "Francisco"]
fake_last_names = ["García", "Martínez", "López", "Hernández", "Pérez", "González", "Rodríguez", "Sánchez", "Ramírez", "Díaz"]

def fake_name():
    return f"{random.choice(fake_last_names)} {random.choice(fake_last_names)} {random.choice(fake_first_names)}"

# Seleccionar equipos aleatorios
teams_sample = random.sample(real_data['teams'], min(MOCK_TEAMS, len(real_data['teams'])))
team_ids_sample = [t['id'] for t in teams_sample]
team_id_to_name = {t['id']: t['name'] for t in teams_sample}

# Filtrar jugadores que pertenezcan a esos equipos (al menos un equipo en la muestra)
filtered_players = []
for p in real_data['players']:
    # Si el jugador tiene algún equipo en la muestra
    if any(tid in team_ids_sample for tid in p['teams']):
        # Crear copia para no modificar original
        mock_p = copy.deepcopy(p)
        # Filtrar equipos del jugador (solo los que están en la muestra)
        mock_p['teams'] = [tid for tid in p['teams'] if tid in team_ids_sample]
        if mock_p['teams']:  # Si le queda al menos un equipo
            # Opcional: cambiar nombre
            if FAKE_NAMES:
                mock_p['name'] = fake_name()
            # Ajustar logros: asignar algunos verdaderos al azar (20% de probabilidad)
            for ach in ['20+ HR', '80+ RBI']:  # Ajusta según tus logros reales
                if ach in mock_p:
                    mock_p[ach] = random.random() < 0.2
            filtered_players.append(mock_p)
            if len(filtered_players) >= MOCK_PLAYERS:
                break

# Crear el mock
mock_data = {
    "teams": teams_sample,
    "players": filtered_players
}

# Guardar como data.json.mock (o como data.json si quieres reemplazar)
with open('data.json.mock', 'w', encoding='utf-8') as f:
    json.dump(mock_data, f, ensure_ascii=False, indent=2)

print(f"Mock generado con {len(mock_data['teams'])} equipos y {len(mock_data['players'])} jugadores.")