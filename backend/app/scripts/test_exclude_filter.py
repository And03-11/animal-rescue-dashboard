"""
Script de prueba para verificar que el filtro 'Exclude From Current Campaign' funciona.
Ejecutar: python -m backend.app.scripts.test_exclude_filter
"""
import os
import sys

# Agregar el directorio raíz al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))))

from backend.app.services.airtable_service import AirtableService

def test_exclude_filter():
    service = AirtableService()
    
    # Pide al usuario la región a probar
    segment = "standard"
    if len(sys.argv) > 1:
        region = sys.argv[1]
        if len(sys.argv) > 2:
            segment = sys.argv[2]
    else:
        try:
            region = input("Ingresa la región a probar (o presiona Enter para 'Mexico'): ").strip()
        except EOFError:
            region = ""
            
    if not region:
        region = "Mexico"

    output_lines = []
    output_lines.append("=" * 60)
    output_lines.append("🧪 TEST: Filtro 'Exclude From Current Campaign'")
    output_lines.append("=" * 60)
    output_lines.append(f"\n📍 Probando con región: {region}")
    output_lines.append(f"📍 Segmento: {segment}")
    output_lines.append("-" * 40)
    
    # Obtener contactos con el filtro actual (excluye los marcados)
    print(f"\n🔍 Buscando contactos (is_bounced=False, segment={segment})...")
    contacts = service.get_campaign_contacts(region=region, is_bounced=False, segment=segment)
    
    output_lines.append(f"\n✅ Contactos encontrados: {len(contacts)}")
    
    if contacts:
        output_lines.append("\n📧 Primeros 10 emails:")
        for i, contact in enumerate(contacts[:10], 1):
            output_lines.append(f"   {i}. {contact.get('Email', 'N/A')}")
        
        if len(contacts) > 10:
            output_lines.append(f"   ... y {len(contacts) - 10} más")
    else:
        output_lines.append("\n⚠️ No se encontraron contactos.")
    
    # Guardar en archivo
    with open("test_exclude_results.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(output_lines))
    
    print("\n".join(output_lines))
    print(f"\n📄 Resultados guardados en: {os.path.abspath('test_exclude_results.txt')}")
    
    print("\n" + "=" * 60)
    print("📋 INSTRUCCIONES PARA PROBAR EL FILTRO:")
    print("=" * 60)
    print("""
1. Ve a tu base de Airtable
2. Busca un donante que aparezca en la lista de arriba
3. Marca su casilla 'Exclude From Current Campaign' ✓
4. Ejecuta este script de nuevo
5. Ese donante YA NO debe aparecer en la lista

Si el donante desaparece de la lista, ¡el filtro funciona! 🎉
""")

if __name__ == "__main__":
    test_exclude_filter()
