from flask import Flask, request, jsonify, send_from_directory
import json
import random
from collections import defaultdict
import os
import datetime
import hashlib
import unicodedata

def normalize_name(name: str) -> str:
    """
    Convierte a minúsculas y elimina acentos/diacríticos.
    Ej: 'PÉREZ LÓPEZ Juan' -> 'perez lopez juan'
    """
    if not name:
        return ""
    # Normalizar a forma NFKD y eliminar caracteres no ASCII (acentos, diéresis, etc.)
    nfkd = unicodedata.normalize('NFKD', name)
    ascii_name = nfkd.encode('ASCII', 'ignore').decode('ASCII')
    return ascii_name.lower()

def reverse_name(name: str) -> str:
    if not name:
        return ""
    name_list = name.split()
    final_name = ""
    for e in name_list:
        if str.isupper(e):
            final_name += (e + ' ')
        else:
            final_name = e + ' ' + final_name
    
    return final_name.strip()

app = Flask(__name__, static_folder='static', static_url_path='')

# Cargar datos desde data.json
with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Para pares de equipos (team1, team2) -> lista de nombres de jugadores
pair_to_players = defaultdict(list)

# Para (equipo, logro) -> lista de nombres de jugadores
achievement_to_players = defaultdict(list)

teams = data['teams']          # lista de dicts con id y name
players = data['players']      # lista de dicts con id, name, teams, y logros

# Mapeo de id de equipo a nombre
team_id_to_name = {t['id']: t['name'] for t in teams}
team_name_to_id = {t['name']: t['id'] for t in teams}
team_names = [t['name'] for t in teams]

# Extraer logros dinámicamente (claves booleanas de los jugadores)
# Tomamos el primer jugador para inspeccionar sus claves, excluyendo 'id','name','teams'
achievements = []
if players:
    sample = players[0]
    for key, value in sample.items():
        if key not in ('id', 'name', 'teams') and isinstance(value, bool):
            achievements.append(key)
# Ordenar para consistencia
achievements.sort()

# Precomputar: para cada par de equipos (id1, id2) la lista de jugadores que jugaron en ambos
# Y para cada logro, la lista de jugadores que lo cumplen
player_teams_map = {}  # player_id -> set de team_ids
player_achievements_map = {}  # player_id -> set de achievement keys (solo los true)
for p in players:
    p['norm_name'] = normalize_name(p['name'])
    p['right_name'] = reverse_name(p['name'])
    p['right_name'] = normalize_name(p['right_name'])
    pid = p['id']
    player_teams_map[pid] = set(p['teams'])
    # Logros true
    ach_set = set()
    for ach in achievements:
        if p.get(ach, False):
            ach_set.add(ach)
    player_achievements_map[pid] = ach_set

# Precalcular pares de equipos con al menos un jugador común
valid_pairs = set()
for pid, team_set in player_teams_map.items():
    team_list = list(team_set)
    for i in range(len(team_list)):
        for j in range(i+1, len(team_list)):
            t1, t2 = sorted([team_list[i], team_list[j]])
            valid_pairs.add((t1, t2))

# Precalcular para cada (equipo, logro) los jugadores que cumplen
team_achievement_players = {}
for team_id in team_id_to_name:
    for ach in achievements:
        key = (team_id, ach)
        players_list = []
        for pid, team_set in player_teams_map.items():
            if team_id in team_set and ach in player_achievements_map.get(pid, set()):
                players_list.append(pid)
        team_achievement_players[key] = players_list

for p in players:
    name = p['name']
    teams = p['teams']
    # Pares de equipos
    for i in range(len(teams)):
        for j in range(i+1, len(teams)):
            t1, t2 = sorted([teams[i], teams[j]])
            pair_to_players[(t1, t2)].append(name)
    # Logros
    for ach in achievements:
        if p.get(ach, False):
            for t in teams:
                achievement_to_players[(t, ach)].append(name)

# Función auxiliar para verificar si un jugador cumple la celda
def check_player(player_id, row_team_id, col_team_id, achievement=None):
    team_set = player_teams_map.get(player_id, set())
    if row_team_id not in team_set:
        return False
    if achievement is not None:
        # Es columna de logro
        return achievement in player_achievements_map.get(player_id, set())
    else:
        # Columna de equipo
        return col_team_id in team_set

# Generar grid válido
def generate_valid_grid():
    max_attempts = 200
    for _ in range(max_attempts):
        # Elegir 3 equipos distintos para las filas
        rows = random.sample(team_names, 3)
        # Elegir 2 equipos distintos para las primeras columnas (que no estén ya en filas)
        remaining_teams = [t for t in team_names if t not in rows]
        if len(remaining_teams) < 2:
            continue
        cols_teams = random.sample(remaining_teams, 2)
        # Elegir un logro aleatorio
        achievement = random.choice(achievements)
        # Verificar que cada una de las 9 celdas tenga al menos un jugador
        valid = True
        # Convertir nombres a IDs para búsqueda eficiente
        row_ids = [team_name_to_id[r] for r in rows]
        col_ids = [team_name_to_id[c] for c in cols_teams]
        # Para cada fila
        for i, r_id in enumerate(row_ids):
            # Columnas equipos
            for j, c_id in enumerate(col_ids):
                # Buscar algún jugador que cumpla (r_id, c_id)
                found = False
                # Usar valid_pairs para acelerar
                pair = tuple(sorted([r_id, c_id]))
                if pair in valid_pairs:
                    # Al menos existe, pero debemos asegurar que el jugador no se repite? No necesario en generación.
                    found = True
                if not found:
                    valid = False
                    break
            if not valid:
                break
            # Columna de logro
            for ach in [achievement]:
                key = (r_id, ach)
                if not team_achievement_players.get(key):
                    valid = False
                    break
            if not valid:
                break
        if valid:
            return {
                'rows': rows,
                'cols': cols_teams,
                'achievement': achievement
            }
    # Fallback: retornar el último intento (puede que no sea perfecto pero es improbable)
    return {
        'rows': rows,
        'cols': cols_teams,
        'achievement': achievement
    }

def get_daily_grid():
    today = datetime.date.today().isoformat()
    seed = int(hashlib.md5(today.encode()).hexdigest()[:8], 16)
    original_state = random.getstate()
    random.seed(seed)
    grid = generate_valid_grid()
    random.setstate(original_state)
    return grid

# Endpoints
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/grid', methods=['GET'])
def get_grid():
    grid = generate_valid_grid()
    return jsonify(grid)

@app.route('/api/suggest', methods=['GET'])
def suggest():
    query = request.args.get('q', '').lower().strip()
    if len(query) < 2:
        return jsonify([])
    norm_query = normalize_name(query)  # pero ya está en minúsculas, solo acentos
    matches = []
    for p in players:
        if query in p['norm_name'].lower() or query in p['right_name'].lower():
            matches.append(p['name'])
            if len(matches) >= 10:
                break
    return jsonify(matches)

@app.route('/api/check', methods=['POST'])
def check():
    data_req = request.get_json()
    player_name = data_req.get('player', '').strip()
    row_team = data_req.get('rowTeam')
    col_team = data_req.get('colTeam')       # None si es columna de logro
    achievement = data_req.get('achievement') # Solo para columna de logro
    is_achievement_col = data_req.get('isAchievementCol', False)

    # Buscar jugador por nombre exacto (insensible)
    player = None
    for p in players:
        if p['name'].lower() == player_name.lower():
            player = p
            break
    if not player:
        return jsonify({'valid': False, 'error': 'Jugador no encontrado'})

    player_id = player['id']
    row_id = team_name_to_id.get(row_team)
    if not row_id:
        return jsonify({'valid': False, 'error': 'Equipo de fila no válido'})

    if is_achievement_col:
        if not achievement:
            return jsonify({'valid': False, 'error': 'Logro no especificado'})
        valid = check_player(player_id, row_id, None, achievement)
        if valid:
            return jsonify({'valid': True, 'name': player['name']})
        else:
            return jsonify({'valid': False, 'error': f'{player["name"]} no cumple el logro {achievement}'})
    else:
        col_id = team_name_to_id.get(col_team)
        if not col_id:
            return jsonify({'valid': False, 'error': 'Equipo de columna no válido'})
        valid = check_player(player_id, row_id, col_id, None)
        if valid:
            return jsonify({'valid': True, 'name': player['name']})
        else:
            return jsonify({'valid': False, 'error': f'{player["name"]} no jugó en {row_team} y {col_team} simultáneamente'})

@app.route('/api/solutions', methods=['POST'])
def get_solutions():
    data = request.get_json()
    rows = data.get('rows')          # lista de nombres de equipos (filas)
    cols = data.get('cols')          # lista de nombres de equipos (primeras dos columnas)
    achievement = data.get('achievement')  # nombre del logro (tercera columna)
    filled_cells = data.get('filledCells', {})  # opcional: celdas ya llenas para no repetir (formato "row_col": player_name)

    solutions = {}
    for i, row_team in enumerate(rows):
        row_id = team_name_to_id[row_team]
        for j in range(3):
            cell_key = f"{i}_{j}"
            # Si la celda ya tiene solución (está llena), no la mostramos
            if cell_key in filled_cells:
                continue
            if j < 2:  # columnas de equipos
                col_team = cols[j]
                col_id = team_name_to_id[col_team]
                t1, t2 = sorted([row_id, col_id])
                players_list = pair_to_players.get((t1, t2), [])
                # Limitar a 5 jugadores para no saturar
                solutions[cell_key] = players_list[:5]
            else:  # columna de logro
                players_list = achievement_to_players.get((row_id, achievement), [])
                solutions[cell_key] = players_list[:5]
    return jsonify(solutions)

@app.route('/api/daily-grid', methods=['GET'])
def daily_grid():
    grid = get_daily_grid()
    return jsonify(grid)

@app.route('/api/config', methods=['GET'])
def config():
    is_dev = os.environ.get('ENVIRONMENT') != 'production'
    return jsonify({'isDevelopment': is_dev})

if __name__ == '__main__':
    app.run(debug=True)