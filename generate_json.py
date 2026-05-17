import sqlite3
import json

def export_to_json(db_path, output_file='data.json'):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Obtener equipos
    cursor.execute("SELECT team_id, team_name FROM team, game, game_by_game_offensive WHERE team.team_id = game_by_game_offensive.player_team_id and game_by_game_offensive.game_id = game.game_id and date_iso >= '2000-05-17' GROUP BY team.team_id")
    teams = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
    print(teams)
    # 2. Obtener jugadores y sus equipos
    # Consulta: por cada registro ofensivo, obtenemos player_id, player_name, player_team_id
    # Agrupamos para evitar duplicados por jugador-equipo
    query = """
        SELECT DISTINCT o.player_id, p.favorite_name, o.player_team_id
        FROM game_by_game_offensive o
        JOIN player p ON o.player_id = p.id
        JOIN game g ON o.game_id = g.game_id
        WHERE date_iso >= "2000-05-17"
    """
    cursor.execute(query)
    player_teams = {}
    for player_id, player_name, team_id in cursor.fetchall():
        if player_id not in player_teams:
            player_teams[player_id] = {
                "name": player_name,
                "teams": set(),
                "20+ HR": False,
                "80+ RBI": False
            }
        player_teams[player_id]["teams"].add(team_id)
    
    # Verificar para cada jugador si ha tenido una temporada de 20+ HR
    cursor.execute("""
        SELECT o.player_id, sum(hr) as HR, te.number_edition, te.t_name
        FROM game_by_game_offensive o
        JOIN game g ON o.game_id = g.game_id
        JOIN tournament_edition te ON g.edition_id = te.edition_id
        WHERE 
        date_iso > "2000-05-17" and 
        te.playoff = 0 
        GROUP BY te.number_edition, te.t_name, player_id
    """)
    for player_id, hr, ne, ne in cursor.fetchall():
        if hr >= 20:
            player_teams[player_id]["20+ HR"] = True
    
    # Verificar para cada jugador si ha tenido una temporada de 100+ rbi
    cursor.execute("""
        SELECT o.player_id, sum(ci) as RBI, te.number_edition, te.t_name
        FROM game_by_game_offensive o
        JOIN game g ON o.game_id = g.game_id
        JOIN tournament_edition te ON g.edition_id = te.edition_id
        WHERE 
        date_iso > "2000-05-17" and 
        te.playoff = 0 
        GROUP BY te.number_edition, te.t_name, player_id
    """)
    for player_id, rbi, ne, ne in cursor.fetchall():
        if rbi >= 80:
            player_teams[player_id]["80+ RBI"] = True

    # 4. Construir lista final de jugadores
    players_list = []
    for pid, data in player_teams.items():
        #print(data)
        players_list.append({
            "id": pid,
            "name": data["name"],
            "teams": list(data["teams"]),
            "20+ HR": data["20+ HR"],
            "80+ RBI": data["80+ RBI"]
        })

    conn.close()

    # 5. Guardar JSON
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump({
            "teams": teams,
            "players": players_list,
        }, f, ensure_ascii=False, indent=2)

    print("data.json actualizado con logros y totales de carrera.")

if __name__ == "__main__":
    # Cambia la ruta a tu base de datos
    export_to_json("baseball_cuba_data test.db")